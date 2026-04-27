import React, { useState, useCallback, useRef } from 'react';
import ReactFlow, {
  Node,
  Edge,
  Background,
  Controls,
  MarkerType,
  Handle,
  Position,
} from 'reactflow';
import 'reactflow/dist/style.css';

import { STUDY_GUIDE_SUBJECTS, SUBJECT_TOPICS } from '../constants';
import { generateStudyMap } from '../services/aiClientService';
import { Button, Card, LoadingSpinner } from './UIComponents';
import { MindmapData, MindmapNode } from '../types';

// ─── Custom Node ─────────────────────────────────────────────────────────────
interface MindMapNodeData {
  label: string;
  description: string;
  level: number;
  hasChildren: boolean;
  isCollapsed: boolean;
  onToggle: (id: string) => void;
  id: string;
}

const MindMapNode = ({ data }: { data: MindMapNodeData }) => {
  const bgColors = [
    'bg-blue-600 text-white border-blue-700',
    'bg-amber-100 dark:bg-amber-900/30 text-gray-800 dark:text-amber-100 border-amber-300 dark:border-amber-800/50',
    'bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-200 border-gray-200 dark:border-slate-700',
    'bg-slate-50 dark:bg-slate-900 text-gray-600 dark:text-slate-400 border-slate-200 dark:border-slate-800',
  ];
  const level = Math.min(data.level, 3);

  return (
    <div
      className={`px-4 py-3 rounded-xl border-2 shadow-lg transition-all ${bgColors[level]} min-w-[140px] max-w-[220px] cursor-default`}
    >
      <Handle type="target" position={Position.Left} className="!bg-gray-400 !w-2 !h-2" />
      <div className="font-bold text-sm leading-tight">{data.label}</div>
      {data.description && (
        <div className="mt-1 text-[10px] leading-snug opacity-75 line-clamp-2">
          {data.description}
        </div>
      )}
      {data.hasChildren && (
        <button
          onClick={(e) => { e.stopPropagation(); data.onToggle(data.id); }}
          className={`mt-2 w-full flex items-center justify-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full transition-all
            ${level === 0
              ? 'bg-white/20 hover:bg-white/30 text-white'
              : 'bg-gray-200/70 hover:bg-gray-300 text-gray-700'
            }`}
        >
          {data.isCollapsed ? (
            <><span className="text-xs leading-none">+</span> Expandir</>
          ) : (
            <><span className="text-xs leading-none">−</span> Recolher</>
          )}
        </button>
      )}
      <Handle type="source" position={Position.Right} className="!bg-gray-400 !w-2 !h-2" />
    </div>
  );
};

const nodeTypes = { mindmap: MindMapNode };

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build the full flat list of nodes/edges + the parent→children map */
function buildFullGraph(centralNode: MindmapNode) {
  const allNodes: Node[] = [];
  const allEdges: Edge[] = [];
  const childrenMap: Record<string, string[]> = {};

  let counter = 0;
  const spacingX = 320;
  const spacingY = 140;

  const calcHeight = (node: MindmapNode): number => {
    if (!node.branches?.length) return spacingY;
    return Math.max(spacingY, node.branches.reduce((s, c) => s + calcHeight(c), 0));
  };

  const traverse = (node: MindmapNode, x: number, y: number, level: number, parentId: string | null) => {
    const id = `node-${counter++}`;
    const subtreeH = calcHeight(node);
    const hasChildren = !!(node.branches && node.branches.length > 0);

    allNodes.push({
      id,
      type: 'mindmap',
      data: { id, label: node.title, description: node.description, level, hasChildren, isCollapsed: level >= 1, onToggle: () => { } },
      position: { x, y },
    });

    if (parentId) {
      childrenMap[parentId] = [...(childrenMap[parentId] || []), id];
      allEdges.push({
        id: `edge-${parentId}-${id}`,
        source: parentId,
        target: id,
        type: 'smoothstep',
        animated: level === 1,
        style: { strokeWidth: 3 - Math.min(level, 2), stroke: level === 1 ? '#2563eb' : '#94a3b8' },
        markerEnd: { type: MarkerType.ArrowClosed, color: level === 1 ? '#2563eb' : '#94a3b8' },
      });
    }

    if (hasChildren) {
      let yOffset = y - subtreeH / 2;
      node.branches!.forEach((branch) => {
        const childH = calcHeight(branch);
        traverse(branch, x + spacingX, yOffset + childH / 2, level + 1, id);
        yOffset += childH;
      });
    }
  };

  traverse(centralNode, 0, 0, 0, null);
  return { allNodes, allEdges, childrenMap };
}

/** Recursively collect all descendant ids */
function getDescendants(id: string, childrenMap: Record<string, string[]>): string[] {
  const children = childrenMap[id] || [];
  return children.flatMap(c => [c, ...getDescendants(c, childrenMap)]);
}

/** Given collapsed set, compute which nodes & edges to show */
function computeVisible(
  allNodes: Node[],
  allEdges: Edge[],
  childrenMap: Record<string, string[]>,
  collapsed: Set<string>,
  onToggle: (id: string) => void,
): { visibleNodes: Node[]; visibleEdges: Edge[] } {
  // Collect all hidden node ids (descendants of collapsed nodes)
  const hidden = new Set<string>();
  collapsed.forEach(id => getDescendants(id, childrenMap).forEach(d => hidden.add(d)));

  const visibleNodes = allNodes
    .filter(n => !hidden.has(n.id))
    .map(n => ({
      ...n,
      data: {
        ...n.data,
        isCollapsed: collapsed.has(n.id),
        onToggle,
      },
    }));

  const visibleEdges = allEdges.filter(e => !hidden.has(e.target) && !hidden.has(e.source));
  return { visibleNodes, visibleEdges };
}

interface StudyGuideViewProps {
  onBack: () => void;
}

const StudyMapView: React.FC<StudyGuideViewProps> = ({ onBack }) => {
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [content, setContent] = useState<MindmapData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Full graph storage (never changes once generated)
  const allNodesRef = useRef<Node[]>([]);
  const allEdgesRef = useRef<Edge[]>([]);
  const childrenMapRef = useRef<Record<string, string[]>>({});

  // Which nodes are currently collapsed
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // Track the current generation request to avoid race conditions
  const requestCounterRef = useRef(0);

  // Toggle a node open/closed
  const handleToggle = useCallback((id: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // Compute visible nodes/edges reactively
  const { visibleNodes, visibleEdges } = React.useMemo(() => {
    if (!allNodesRef.current.length) return { visibleNodes: [], visibleEdges: [] };
    return computeVisible(allNodesRef.current, allEdgesRef.current, childrenMapRef.current, collapsed, handleToggle);
  }, [collapsed, handleToggle]);

  // Build the full graph from AI response + initialize collapsed state
  const generateFlowData = useCallback((centralNode: MindmapNode) => {
    const { allNodes, allEdges, childrenMap } = buildFullGraph(centralNode);
    allNodesRef.current = allNodes;
    allEdgesRef.current = allEdges;
    childrenMapRef.current = childrenMap;

    // Default: only level-0 root is expanded, all level-1 nodes are collapsed
    const initialCollapsed = new Set(
      allNodes.filter(n => n.data.hasChildren && n.data.level >= 1).map(n => n.id)
    );
    setCollapsed(initialCollapsed);
  }, []);

  const handleGenerate = async (subject: string, topic?: string) => {
    // Increment request counter and store current value for this closure
    const currentRequestId = ++requestCounterRef.current;

    setSelectedSubject(subject);
    setSelectedTopic(topic || null);
    setLoading(true);
    setContent(null);
    setError(null);
    // Reset graph
    allNodesRef.current = [];
    allEdgesRef.current = [];
    childrenMapRef.current = {};
    setCollapsed(new Set());

    try {
      const result = await generateStudyMap(subject, topic);

      // Check if this request is still the active one
      if (currentRequestId !== requestCounterRef.current) {
        console.log("Ignorando resultado de requisição antiga.");
        return;
      }

      if (result && result.centralNode) {
        setContent(result);
        generateFlowData(result.centralNode);
      } else {
        throw new Error("Formato de mapa inválido recebido.");
      }
    } catch (e) {
      // Still check if active before setting error state
      if (currentRequestId === requestCounterRef.current) {
        console.error("Erro ao gerar mapa:", e);
        setError("Ocorreu um erro ao gerar o mapa. Tente novamente.");
        setContent(null);
      }
    } finally {
      // Only reset loading if this is still the active request
      if (currentRequestId === requestCounterRef.current) {
        setLoading(false);
      }
    }
  };

  const renderRecursiveHTML = (node: MindmapNode, level: number): string => {
    const branchesHTML = node.branches?.map(b => renderRecursiveHTML(b, level + 1)).join('') || '';
    return `
      <div style="margin-top: 20px; margin-left: ${level * 20}px; padding: 15px; border-left: 5px solid ${level === 0 ? '#004aad' : '#f59e0b'}; background: #f8fafc; border-radius: 8px;">
        <h${Math.min(level + 2, 6)} style="margin: 0; color: #1e293b;">${node.title}</h${Math.min(level + 2, 6)}>
        <p style="margin: 8px 0 0 0; font-size: 14px; color: #475569;">${node.description}</p>
        ${branchesHTML}
      </div>
    `;
  };

  const handleDownloadPDF = () => {
    if (!content || !selectedSubject) return;

    const mapHTML = renderRecursiveHTML(content.centralNode, 0);

    const htmlContent = `
      <html>
        <head>
          <title>Mapa de Estudos ENEM - ${selectedSubject}</title>
          <style>
            body { font-family: 'Helvetica', 'Arial', sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 40px; }
            .header { text-align: center; margin-bottom: 40px; border-bottom: 2px solid #eee; padding-bottom: 20px; }
            .incidence { background: #fffbeb; padding: 20px; border-radius: 10px; border: 1px solid #fef3c7; margin-bottom: 30px; }
            h1 { color: #004aad; margin: 0; }
            h2 { color: #1e293b; }
            .footer { margin-top: 50px; text-align: center; font-size: 12px; color: #999; border-top: 1px solid #eee; padding-top: 20px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Studr - Mapa Mental</h1>
            <p>Assunto: ${selectedSubject} ${selectedTopic ? `(${selectedTopic})` : ''}</p>
          </div>

          <div class="incidence">
            <strong>📊 Como cai no ENEM:</strong>
            <p style="margin-top: 10px; font-size: 14px;">${content.highIncidenceInfo}</p>
          </div>

          ${mapHTML}

          <div class="footer">Gerado via Inteligência Artificial pelo Studr</div>
          <script>window.onload = function() { window.print(); }</script>
        </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(htmlContent);
      printWindow.document.close();
    }
  };

  // Mobile: track if we're showing the map or the selector
  const [showMapOnMobile, setShowMapOnMobile] = useState(false);

  // When generation starts on mobile, switch to map view
  const handleGenerateMobile = async (subject: string, topic?: string) => {
    setShowMapOnMobile(true);
    await handleGenerate(subject, topic);
  };

  return (
    <div className="max-w-6xl mx-auto p-3 sm:p-4 animate-fade-in flex flex-col" style={{ height: 'calc(100dvh - 1rem)' }}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-3 sm:mb-4 flex-shrink-0">
        <Button
          variant="outline"
          onClick={() => {
            if (showMapOnMobile && window.innerWidth < 1024) {
              setShowMapOnMobile(false);
            } else {
              onBack();
            }
          }}
          className="text-sm whitespace-nowrap"
        >
          ← {showMapOnMobile && typeof window !== 'undefined' && window.innerWidth < 1024 ? 'Matérias' : 'Voltar'}
        </Button>
        <div className="overflow-hidden">
          <h1 className="text-xl sm:text-3xl font-bold text-gray-800 dark:text-slate-100 truncate">🗺️ Mapa de Estudos</h1>
          <p className="text-gray-500 dark:text-slate-400 text-xs sm:text-sm hidden sm:block">Visualização interativa estilo MindMeister.</p>
        </div>
      </div>

      {/* Main Layout */}
      <div className="flex flex-col lg:grid lg:grid-cols-4 gap-3 sm:gap-4 flex-1 min-h-0">

        {/* Subject Selection Sidebar — always visible on lg+; hidden on mobile when map is showing */}
        <div className={`lg:col-span-1 overflow-y-auto pr-1 flex-shrink-0 ${showMapOnMobile ? 'hidden lg:block' : 'block'}`}>
          <Card className="h-fit">
            <h3 className="font-bold text-gray-700 dark:text-slate-200 mb-3 uppercase text-xs tracking-wider">
              {selectedSubject ? (
                <button
                  onClick={() => { setSelectedSubject(null); setSelectedTopic(null); setContent(null); setError(null); setShowMapOnMobile(false); }}
                  className="text-enem-blue hover:underline flex items-center gap-1"
                >
                  ← Voltar às Matérias
                </button>
              ) : 'Matérias Disponíveis'}
            </h3>

            <div className="space-y-1 pr-1 custom-scrollbar">
              {!selectedSubject ? (
                STUDY_GUIDE_SUBJECTS.map(subject => (
                  <button
                    key={subject}
                    onClick={() => setSelectedSubject(subject)}
                    className="w-full text-left px-3 py-2.5 rounded-lg transition-all text-xs font-semibold border bg-white dark:bg-slate-800 text-gray-600 dark:text-slate-300 border-gray-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/70 hover:border-gray-200 dark:hover:border-slate-600"
                  >
                    <div className="flex justify-between items-center">
                      <span>{subject}</span>
                      <span className="text-[10px] text-gray-400 dark:text-slate-500">▶</span>
                    </div>
                  </button>
                ))
              ) : (
                <>
                  <div className="mb-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-800/30">
                    <p className="text-[10px] uppercase font-bold text-blue-800 dark:text-blue-300 mb-1">Matéria Selecionada</p>
                    <p className="text-sm font-bold text-blue-900 dark:text-blue-200">{selectedSubject}</p>
                  </div>

                  <button
                    onClick={() => handleGenerateMobile(selectedSubject)}
                    disabled={loading}
                    className={`w-full text-left px-3 py-2.5 rounded-lg transition-all text-xs font-bold border mb-3
                      ${!selectedTopic && content
                        ? 'bg-enem-blue text-white border-enem-blue shadow-md'
                        : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                      }`}
                  >
                    ✨ Gerar Geral ({selectedSubject})
                  </button>

                  <p className="text-[10px] uppercase font-bold text-gray-400 dark:text-slate-500 mb-2 px-1">Tópicos Específicos</p>

                  {SUBJECT_TOPICS[selectedSubject]?.map(topic => (
                    <button
                      key={topic}
                      onClick={() => handleGenerateMobile(selectedSubject, topic)}
                      disabled={loading}
                      className={`w-full text-left px-3 py-2.5 rounded-lg transition-all text-xs font-semibold border
                        ${selectedTopic === topic
                          ? 'bg-enem-blue text-white border-enem-blue shadow-md'
                          : 'bg-white dark:bg-slate-800 text-gray-600 dark:text-slate-300 border-gray-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/70 hover:border-gray-200 dark:hover:border-slate-600'
                        }`}
                    >
                      <div className="flex justify-between items-center">
                        <span>{topic}</span>
                        {selectedTopic === topic && loading && <span className="animate-spin text-[10px]">⏳</span>}
                      </div>
                    </button>
                  ))}
                </>
              )}
            </div>
          </Card>
        </div>

        {/* Content Area — on mobile, only visible when showMapOnMobile OR no subject selected */}
        <div className={`lg:col-span-3 flex flex-col min-h-0 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden relative
          ${!showMapOnMobile && selectedSubject ? 'hidden lg:flex' : 'flex flex-1'}`}
        >
          {!selectedSubject ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-400 dark:text-slate-600 p-6">
              <span className="text-6xl mb-4">📖</span>
              <p className="text-lg text-center dark:text-slate-500">Selecione uma matéria ao lado para gerar seu mapa.</p>
            </div>
          ) : (
            <>
              {loading ? (
                <div className="flex flex-col items-center justify-center h-full">
                  <LoadingSpinner />
                  <h3 className="mt-6 text-xl font-bold text-enem-blue animate-pulse">Desenhando seu Mapa...</h3>
                  <p className="text-gray-500 mt-2 text-center max-w-xs px-4">Nosso especialista de IA está compilando as melhores estratégias e conexões para você.</p>
                </div>
              ) : error ? (
                <div className="h-full flex flex-col items-center justify-center text-red-400 p-6">
                  <p className="text-center">{error}</p>
                  <Button onClick={() => handleGenerateMobile(selectedSubject)} className="mt-4">Tentar Novamente</Button>
                </div>
              ) : content ? (
                <div className="flex flex-col h-full animate-fade-in">
                  {/* Toolbar — static, above the map */}
                  <div className="flex-shrink-0 flex justify-between items-center bg-white dark:bg-slate-900 p-2 sm:p-3 border-b border-gray-100 dark:border-slate-800 gap-2">
                    <div className="min-w-0">
                      <h2 className="text-sm font-bold text-gray-800 dark:text-slate-100 truncate">{selectedTopic || selectedSubject}</h2>
                      <span className="text-[10px] text-green-600 dark:text-green-400 font-bold bg-green-50 dark:bg-green-900/20 px-1.5 py-0.5 rounded">
                        Interativo
                      </span>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <Button onClick={handleDownloadPDF} variant="primary" className="text-[10px] h-8 px-3 flex items-center gap-1.5">
                        <span>🖨️</span> <span>Imprimir / PDF</span>
                      </Button>
                    </div>
                  </div>

                  {/* React Flow Canvas — takes remaining space */}
                  <div className="flex-1 w-full bg-[#f8fafc] dark:bg-slate-950 min-h-0">
                    <ReactFlow
                      nodes={visibleNodes}
                      edges={visibleEdges}
                      nodeTypes={nodeTypes}
                      fitView
                      minZoom={0.1}
                      maxZoom={1.5}
                      fitViewOptions={{ padding: 0.4 }}
                      defaultEdgeOptions={{
                        type: 'smoothstep',
                        markerEnd: { type: MarkerType.ArrowClosed }
                      }}
                    >
                      <Background color="#cbd5e1" gap={20} size={1} />
                      <Controls showInteractive={false} className="bg-white shadow-xl rounded-lg border-gray-200" />
                    </ReactFlow>
                  </div>

                  {/* Estratégia ENEM — static, below the map */}
                  <div className="flex-shrink-0 border-t border-amber-200 dark:border-amber-900/30 bg-amber-50 dark:bg-amber-900/20 px-4 py-3">
                    <div className="flex items-start gap-3">
                      <span className="text-xl flex-shrink-0">📊</span>
                      <div>
                        <h4 className="font-bold text-gray-800 dark:text-slate-100 text-xs sm:text-sm">Estratégia ENEM</h4>
                        <p className="text-[11px] sm:text-xs text-gray-600 dark:text-slate-400 leading-relaxed mt-0.5 italic">{content.highIncidenceInfo}</p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-gray-400 p-6">
                  <span className="text-5xl mb-4">✨</span>
                  <p className="text-base text-center">Escolha um tópico ou clique em "Gerar Geral" para começar.</p>
                </div>
              )}
            </>
          )}
        </div>

      </div>
    </div>
  );
};

export default StudyMapView;
