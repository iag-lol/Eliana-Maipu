-- =====================================================
-- Blindaje para permitir un solo turno abierto a la vez
-- =====================================================

-- 1. Cerrar turnos abiertos sin movimientos antes de crear la restricción.
WITH open_shift_activity AS (
  SELECT
    s.id,
    EXISTS (
      SELECT 1
      FROM elianamaipu_sales sale
      WHERE sale.shift_id = s.id
    ) AS has_sales,
    EXISTS (
      SELECT 1
      FROM elianamaipu_expenses expense
      WHERE expense.shift_id = s.id
    ) AS has_expenses,
    EXISTS (
      SELECT 1
      FROM elianamaipu_stock_changes change
      WHERE change.shift_id = s.id
        AND NOT (change.quantity_added > 0 AND change.stock_before = change.stock_after)
    ) AS has_stock_changes
  FROM elianamaipu_shifts s
  WHERE s.status = 'open'
)
UPDATE elianamaipu_shifts s
SET
  end_time = COALESCE(s.end_time, NOW()),
  status = 'closed',
  total_sales = COALESCE(s.total_sales, 0),
  tickets = COALESCE(s.tickets, 0),
  payments_breakdown = COALESCE(
    s.payments_breakdown,
    '{"cash":0,"card":0,"transfer":0,"fiado":0,"staff":0}'::jsonb
  ),
  total_expenses = COALESCE(s.total_expenses, 0)
FROM open_shift_activity activity
WHERE s.id = activity.id
  AND NOT activity.has_sales
  AND NOT activity.has_expenses
  AND NOT activity.has_stock_changes;

-- 2. Garantizar que nunca existan dos turnos abiertos al mismo tiempo.
CREATE UNIQUE INDEX IF NOT EXISTS elianamaipu_one_open_shift_idx
ON elianamaipu_shifts ((1))
WHERE status = 'open';

-- 3. Validación rápida.
SELECT
  status,
  COUNT(*) AS total
FROM elianamaipu_shifts
WHERE status = 'open'
GROUP BY status;
