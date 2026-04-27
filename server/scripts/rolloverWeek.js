/**
 * rolloverWeek.js
 * ---------------
 * Script avulso para disparar a virada semanal manualmente ou via Railway Cron.
 * Uso: node server/scripts/rolloverWeek.js
 */

import { rolloverWeek } from '../services/rankingService.js';

rolloverWeek()
  .then(() => {
    console.log('[rolloverWeek] Concluído com sucesso.');
    process.exit(0);
  })
  .catch(err => {
    console.error('[rolloverWeek] Erro:', err);
    process.exit(1);
  });
