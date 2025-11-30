-- =====================================================
-- SQL para tabla de gastos y actualización de turnos
-- =====================================================

-- 1. Crear tabla de gastos (expenses)
CREATE TABLE IF NOT EXISTS elianamaipu_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id UUID NOT NULL REFERENCES elianamaipu_shifts(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('sueldo', 'flete', 'proveedor', 'otro')),
  amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Crear índices para mejorar rendimiento
CREATE INDEX idx_expenses_shift_id ON elianamaipu_expenses(shift_id);
CREATE INDEX idx_expenses_created_at ON elianamaipu_expenses(created_at);

-- 3. Agregar columna total_expenses a la tabla de turnos
ALTER TABLE elianamaipu_shifts
ADD COLUMN IF NOT EXISTS total_expenses NUMERIC(10, 2) DEFAULT 0;

-- 4. Crear función para actualizar total_expenses automáticamente
CREATE OR REPLACE FUNCTION update_shift_total_expenses()
RETURNS TRIGGER AS $$
BEGIN
  -- Si se inserta un gasto
  IF (TG_OP = 'INSERT') THEN
    UPDATE elianamaipu_shifts
    SET total_expenses = COALESCE(total_expenses, 0) + NEW.amount
    WHERE id = NEW.shift_id;
    RETURN NEW;
  END IF;

  -- Si se elimina un gasto
  IF (TG_OP = 'DELETE') THEN
    UPDATE elianamaipu_shifts
    SET total_expenses = COALESCE(total_expenses, 0) - OLD.amount
    WHERE id = OLD.shift_id;
    RETURN OLD;
  END IF;

  -- Si se actualiza un gasto
  IF (TG_OP = 'UPDATE') THEN
    -- Restar el monto anterior y sumar el nuevo
    UPDATE elianamaipu_shifts
    SET total_expenses = COALESCE(total_expenses, 0) - OLD.amount + NEW.amount
    WHERE id = NEW.shift_id;
    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 5. Crear trigger para actualizar automáticamente total_expenses
DROP TRIGGER IF EXISTS trigger_update_shift_expenses ON elianamaipu_expenses;

CREATE TRIGGER trigger_update_shift_expenses
AFTER INSERT OR UPDATE OR DELETE ON elianamaipu_expenses
FOR EACH ROW
EXECUTE FUNCTION update_shift_total_expenses();

-- 6. Actualizar el cash_expected para incluir los gastos
-- NOTA: Esto se hace en el código de cierre de turno
-- cash_expected = initial_cash + ventas_efectivo - total_expenses

-- 7. Verificar que todo esté correcto
SELECT
  'Tabla expenses creada' AS status,
  COUNT(*) AS total_gastos
FROM elianamaipu_expenses;

SELECT
  'Columna total_expenses agregada' AS status,
  COUNT(*) AS total_turnos
FROM elianamaipu_shifts;

-- 8. Consulta de ejemplo para ver gastos por turno
SELECT
  s.id AS shift_id,
  s.seller,
  s.type AS shift_type,
  s.start_time,
  s.total_expenses,
  COUNT(e.id) AS cantidad_gastos,
  COALESCE(SUM(e.amount), 0) AS total_calculado
FROM elianamaipu_shifts s
LEFT JOIN elianamaipu_expenses e ON e.shift_id = s.id
WHERE s.status = 'open'
GROUP BY s.id, s.seller, s.type, s.start_time, s.total_expenses;

-- =====================================================
-- INSTRUCCIONES DE USO:
-- =====================================================
-- 1. Ejecuta este SQL en tu base de datos Supabase
-- 2. La tabla expenses se creará automáticamente
-- 3. El trigger actualizará total_expenses en cada inserción/eliminación
-- 4. Al cerrar el turno, el código TypeScript calculará:
--    cash_expected = initial_cash + cash_sales - total_expenses
-- =====================================================
