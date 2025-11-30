-- =====================================================
-- SQL para tabla de cambios de stock
-- =====================================================

-- 1. Crear tabla de cambios de stock (stock_changes)
CREATE TABLE IF NOT EXISTS elianamaipu_stock_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id UUID NOT NULL REFERENCES elianamaipu_shifts(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES elianamaipu_products(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL,
  quantity_added INTEGER NOT NULL,
  stock_before INTEGER NOT NULL,
  stock_after INTEGER NOT NULL,
  modified_by TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Crear índices para mejorar rendimiento
CREATE INDEX idx_stock_changes_shift_id ON elianamaipu_stock_changes(shift_id);
CREATE INDEX idx_stock_changes_product_id ON elianamaipu_stock_changes(product_id);
CREATE INDEX idx_stock_changes_created_at ON elianamaipu_stock_changes(created_at);
CREATE INDEX idx_stock_changes_modified_by ON elianamaipu_stock_changes(modified_by);

-- 3. Verificar que todo esté correcto
SELECT
  'Tabla stock_changes creada' AS status,
  COUNT(*) AS total_cambios
FROM elianamaipu_stock_changes;

-- 4. Consulta de ejemplo para ver cambios por turno
SELECT
  s.id AS shift_id,
  s.seller,
  s.type AS shift_type,
  s.start,
  COUNT(sc.id) AS cantidad_cambios,
  SUM(sc.quantity_added) AS total_unidades_agregadas
FROM elianamaipu_shifts s
LEFT JOIN elianamaipu_stock_changes sc ON sc.shift_id = s.id
WHERE s.status = 'open'
GROUP BY s.id, s.seller, s.type, s.start;

-- 5. Consulta detallada de cambios de stock por turno
SELECT
  sc.id,
  sc.created_at,
  sc.product_name,
  sc.quantity_added,
  sc.stock_before,
  sc.stock_after,
  sc.modified_by,
  s.seller AS shift_seller,
  s.type AS shift_type
FROM elianamaipu_stock_changes sc
JOIN elianamaipu_shifts s ON s.id = sc.shift_id
ORDER BY sc.created_at DESC
LIMIT 50;

-- 6. Consulta para resumen de actividad por producto
SELECT
  p.name AS producto,
  p.category AS categoria,
  COUNT(sc.id) AS veces_modificado,
  SUM(sc.quantity_added) AS total_agregado,
  p.stock AS stock_actual
FROM elianamaipu_products p
LEFT JOIN elianamaipu_stock_changes sc ON sc.product_id = p.id
GROUP BY p.id, p.name, p.category, p.stock
ORDER BY veces_modificado DESC, total_agregado DESC;

-- =====================================================
-- INSTRUCCIONES DE USO:
-- =====================================================
-- 1. Ejecuta este SQL en tu base de datos Supabase
-- 2. La tabla stock_changes se creará automáticamente
-- 3. Cada vez que se agregue stock desde el botón flotante:
--    - Se registrará quién hizo el cambio (usuario del turno)
--    - Se guardará el stock antes y después
--    - Se vinculará al turno activo
-- 4. Los cambios quedarán disponibles para:
--    - Generar reportes PDF del turno
--    - Auditar modificaciones de inventario
--    - Rastrear quién modificó qué producto
-- =====================================================
