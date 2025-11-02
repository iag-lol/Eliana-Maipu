import "./App.css";
import {
  ActionIcon,
  AppShell,
  Autocomplete,
  Badge,
  Button,
  Card,
  Divider,
  Drawer,
  Grid,
  Group,
  Modal,
  NumberInput,
  Paper,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  ThemeIcon,
  Title,
  Tooltip,
  Progress,
  useMantineColorScheme
} from "@mantine/core";
import { Notifications, notifications } from "@mantine/notifications";
import { useDisclosure, useMediaQuery } from "@mantine/hooks";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
  Cell
} from "recharts";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/es";
import {
  AlertTriangle,
  BadgeCheck,
  BarChart3,
  BoxIcon,
  Clock3,
  CreditCard,
  ArrowLeftRight,
  Coins,
  Edit,
  Filter,
  KeyRound,
  LayoutDashboard,
  LucideIcon,
  MonitorPlay,
  Moon,
  Package,
  PiggyBank,
  Plus,
  Receipt,
  RefreshCcw,
  Search,
  ShieldCheck,
  ShoppingCart,
  Sun,
  TrendingUp,
  UserPlus,
  UsersRound,
  Wallet,
  Waypoints,
  X
} from "lucide-react";
import { supabase } from "./lib/supabaseClient";
import {
  CartLine,
  Client,
  ClientMovement,
  PaymentMethod,
  Product,
  ReportFilters,
  Sale,
  SaleItem,
  Shift,
  ShiftSummary,
  ShiftType
} from "./types";
import { FALLBACK_CLIENTS, FALLBACK_PRODUCTS, FALLBACK_SALES, FALLBACK_SHIFTS } from "./data/fallback";
import { formatCurrency, formatDate, formatDateTime, formatTime } from "./utils/format";

dayjs.extend(relativeTime);
dayjs.locale("es");

const ADMIN_PASSWORD = "eliana152100";

type TabId = "dashboard" | "pos" | "inventory" | "fiados" | "reports" | "shifts";

interface TabConfig {
  id: TabId;
  label: string;
  icon: LucideIcon;
  adminOnly?: boolean;
}

const TABS: TabConfig[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "pos", label: "Punto de venta", icon: ShoppingCart },
  { id: "inventory", label: "Inventario", icon: BoxIcon, adminOnly: true },
  { id: "fiados", label: "Clientes fiados", icon: UsersRound, adminOnly: true },
  { id: "reports", label: "Reportes", icon: BarChart3, adminOnly: true },
  { id: "shifts", label: "Turnos", icon: Clock3, adminOnly: true }
];

interface PaymentOption {
  id: PaymentMethod;
  label: string;
  description: string;
  icon: LucideIcon;
  accent: string;
}

const PAYMENT_OPTIONS: PaymentOption[] = [
  {
    id: "cash",
    label: "Efectivo",
    description: "Controla el ingreso de efectivo y calcula el cambio automáticamente.",
    icon: Wallet,
    accent: "teal"
  },
  {
    id: "card",
    label: "Tarjeta",
    description: "Pagos con débito o crédito, registra voucher y posibles reversos.",
    icon: CreditCard,
    accent: "indigo"
  },
  {
    id: "transfer",
    label: "Transferencia",
    description: "Pagos con comprobante electrónico o QR bancario.",
    icon: ArrowLeftRight,
    accent: "cyan"
  },
  {
    id: "fiado",
    label: "Fiado",
    description: "Asocia la venta a un cliente autorizado y actualiza su deuda.",
    icon: ShieldCheck,
    accent: "orange"
  },
  {
    id: "staff",
    label: "Consumo del personal",
    description: "Controla consumos internos vinculados al turno activo.",
    icon: BadgeCheck,
    accent: "pink"
  }
];

const SHIFT_TYPES: { label: string; value: ShiftType }[] = [
  { label: "Turno Día", value: "dia" },
  { label: "Turno Noche", value: "noche" }
];

const REPORT_RANGES: { label: string; value: ReportFilters["range"] }[] = [
  { label: "Hoy", value: "today" },
  { label: "Semana", value: "week" },
  { label: "Mes", value: "month" },
  { label: "Personalizado", value: "custom" }
];

const PAYMENT_COLORS: Record<PaymentMethod, string> = {
  cash: "#12b886",
  card: "#4263eb",
  transfer: "#1098ad",
  fiado: "#f76707",
  staff: "#e64980"
};

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: "Efectivo",
  card: "Tarjeta",
  transfer: "Transferencia",
  fiado: "Fiado",
  staff: "Consumo del personal"
};

const PAYMENT_ORDER: PaymentMethod[] = ["cash", "card", "transfer", "fiado", "staff"];

const mapProductRow = (row: any): Product => ({
  id: row.id,
  name: row.name,
  barcode: row.barcode,
  category: row.category,
  price: row.price ?? 0,
  stock: row.stock ?? 0,
  minStock: row.min_stock ?? 5,
  created_at: row.created_at,
  updated_at: row.updated_at
});

const mapClientRow = (row: any): Client => ({
  id: row.id,
  name: row.name,
  authorized: row.authorized ?? false,
  balance: row.balance ?? 0,
  limit: row.credit_limit ?? 0,
  updated_at: row.updated_at
});

const mapSaleRow = (row: any): Sale => ({
  id: row.id,
  ticket: row.ticket,
  type: row.type ?? "sale",
  total: row.total ?? 0,
  paymentMethod: row.payment_method ?? "cash",
  cashReceived: row.cash_received,
  change: row.change_amount,
  shiftId: row.shift_id,
  seller: row.seller,
  created_at: row.created_at,
  items: Array.isArray(row.items)
    ? row.items
    : (typeof row.items === "string" ? (JSON.parse(row.items) as SaleItem[]) : []),
  notes: row.notes
});

const mapShiftRow = (row: any): Shift => ({
  id: row.id,
  seller: row.seller,
  type: row.type ?? "dia",
  start: row.start_time ?? row.start ?? row.created_at,
  end: row.end_time ?? row.end ?? null,
  status: row.status ?? (row.end_time ? "closed" : "open"),
  cash_expected: row.cash_expected ?? null,
  cash_counted: row.cash_counted ?? null,
  difference: row.difference ?? null,
  total_sales: row.total_sales ?? null,
  tickets: row.tickets ?? null,
  payments_breakdown: row.payments_breakdown ?? null
});

const generateId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;

async function fetchProducts(): Promise<Product[]> {
  const { data, error } = await supabase
    .from("elianamaipu_products")
    .select("*")
    .order("name", { ascending: true });

  if (error) {
    console.warn("Fallo al cargar productos, usando datos locales", error.message);
    return FALLBACK_PRODUCTS;
  }

  return (data ?? []).map(mapProductRow);
}

async function fetchClients(): Promise<Client[]> {
  const { data, error } = await supabase
    .from("elianamaipu_clients")
    .select("*")
    .order("name", { ascending: true });

  if (error) {
    console.warn("Fallo al cargar clientes, usando datos locales", error.message);
    return FALLBACK_CLIENTS;
  }

  return (data ?? []).map(mapClientRow);
}

async function fetchSales(): Promise<Sale[]> {
  const { data, error } = await supabase
    .from("elianamaipu_sales")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("Fallo al cargar ventas, usando datos locales", error.message);
    return FALLBACK_SALES;
  }

  return (data ?? []).map(mapSaleRow);
}

async function fetchShifts(): Promise<Shift[]> {
  const { data, error } = await supabase
    .from("elianamaipu_shifts")
    .select("*")
    .order("start_time", { ascending: false });

  if (error) {
    console.warn("Fallo al cargar turnos, usando datos locales", error.message);
    return FALLBACK_SHIFTS;
  }

  return (data ?? []).map(mapShiftRow);
}

const computeShiftSummary = (sales: Sale[], shiftId: string | null | undefined): ShiftSummary => {
  const filtered = sales.filter((sale) => sale.shiftId === shiftId);
  const result: ShiftSummary = {
    total: 0,
    tickets: 0,
    byPayment: {
      cash: 0,
      card: 0,
      transfer: 0,
      fiado: 0,
      staff: 0
    }
  };

  filtered.forEach((sale) => {
    if (sale.type === "return") {
      result.byPayment[sale.paymentMethod] -= sale.total;
      result.total -= sale.total;
      return;
    }
    result.total += sale.total;
    result.tickets += 1;
    result.byPayment[sale.paymentMethod] += sale.total;
  });

  return result;
};

const CustomerDisplay = ({
  cart,
  total,
  change,
  paymentLabel
}: {
  cart: { product: Product; quantity: number; subtotal: number }[];
  total: number;
  change: number;
  paymentLabel: string;
}) => (
  <Grid gutter="xl" align="stretch">
    <Grid.Col span={{ base: 12, md: 6 }}>
      <Card
        withBorder
        shadow="xl"
        radius="xl"
        h="100%"
        style={{
          background: "linear-gradient(160deg, var(--mantine-color-indigo-6), var(--mantine-color-indigo-3))",
          color: "white"
        }}
      >
        <Stack gap="lg">
          <Title order={2} c="white">
            Negocio Eliana Maipú
          </Title>
          <Text c="white" size="lg">
            ¡Gracias por tu preferencia! Revisa nuestras promociones destacadas del día:
          </Text>
          <Stack gap="sm" c="white">
            <Group gap="sm">
              <ThemeIcon color="white" variant="light" radius="xl">
                <TrendingUp size={18} />
              </ThemeIcon>
              <Text fw={600}>2x $3.500 en bebidas seleccionadas</Text>
            </Group>
            <Group gap="sm">
              <ThemeIcon color="white" variant="light" radius="xl">
                <BoxIcon size={18} />
              </ThemeIcon>
              <Text fw={600}>15% de descuento en productos de limpieza</Text>
            </Group>
            <Group gap="sm">
              <ThemeIcon color="white" variant="light" radius="xl">
                <Waypoints size={18} />
              </ThemeIcon>
              <Text fw={600}>Panadería y lácteos frescos todos los días</Text>
            </Group>
          </Stack>
          <Badge size="lg" radius="xl" variant="light" color="white" maw={220}>
            Atención personalizada y rápida
          </Badge>
        </Stack>
      </Card>
    </Grid.Col>
    <Grid.Col span={{ base: 12, md: 6 }}>
      <Card shadow="lg" withBorder radius="xl" h="100%">
        <Stack gap="md">
          <Group justify="space-between">
            <Title order={3}>Detalle de tu compra</Title>
            <Badge color="indigo" size="lg">
              {paymentLabel}
            </Badge>
          </Group>
          <Divider />
          <Stack gap="sm" h={360} style={{ overflow: "auto" }}>
            {cart.length === 0 ? (
              <Paper withBorder p="xl" radius="lg">
                <Text c="dimmed" ta="center">
                  Aún no hay productos agregados.
                </Text>
              </Paper>
            ) : (
              cart.map((item) => (
                <Paper key={item.product.id} withBorder radius="lg" p="md">
                  <Group justify="space-between" align="center">
                    <div>
                      <Text fw={600}>{item.product.name}</Text>
                      <Text size="sm" c="dimmed">
                        {item.quantity} x {formatCurrency(item.product.price)}
                      </Text>
                    </div>
                    <Text fw={700}>{formatCurrency(item.subtotal)}</Text>
                  </Group>
                </Paper>
              ))
            )}
          </Stack>
          <Divider />
          <Stack gap="sm">
            <Group justify="space-between">
              <Text c="dimmed">Total a pagar</Text>
              <Text fw={700} size="lg">
                {formatCurrency(total)}
              </Text>
            </Group>
            {change >= 0 && (
              <Group justify="space-between">
                <Text c="dimmed">Cambio</Text>
                <Text fw={600} color={change >= 0 ? "teal" : "red"}>
                  {formatCurrency(change)}
                </Text>
              </Group>
            )}
          </Stack>
        </Stack>
      </Card>
    </Grid.Col>
  </Grid>
);

interface PasswordModalProps {
  opened: boolean;
  onClose: () => void;
  onUnlock: () => void;
}

const PasswordModal = ({ opened, onClose, onUnlock }: PasswordModalProps) => {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!opened) {
      setPassword("");
      setError(null);
    }
  }, [opened]);

  const handleUnlock = () => {
    if (password === ADMIN_PASSWORD) {
      notifications.show({
        title: "Acceso concedido",
        message: "Secciones administrativas desbloqueadas.",
        color: "teal"
      });
      onUnlock();
      onClose();
    } else {
      setError("Contraseña incorrecta. Inténtalo nuevamente.");
      notifications.show({
        title: "Acceso denegado",
        message: "La contraseña ingresada no es válida.",
        color: "red"
      });
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Acceso administrativo" centered>
      <Stack>
        <Text c="dimmed">
          Ingresa la contraseña para administrar inventario, fiados, reportes y turnos.
        </Text>
        <TextInput
          label="Contraseña"
          placeholder="••••••"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.currentTarget.value)}
          error={error ?? undefined}
          autoFocus
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleUnlock} leftSection={<ShieldCheck size={18} />}>
            Desbloquear
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};

interface ShiftModalProps {
  opened: boolean;
  mode: "open" | "close";
  onClose: () => void;
  onOpenShift: (payload: { seller: string; type: ShiftType; initialCash: number }) => void;
  onCloseShift: (payload: { cashCounted: number }) => void;
  summary: ShiftSummary & { cashExpected: number };
}

const ShiftModal = ({ opened, mode, onClose, onOpenShift, onCloseShift, summary }: ShiftModalProps) => {
  const [seller, setSeller] = useState("");
  const [shiftType, setShiftType] = useState<ShiftType>("dia");
  const [initialCash, setInitialCash] = useState<number | undefined>(undefined);
  const [cashCounted, setCashCounted] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (!opened) {
      setSeller("");
      setShiftType("dia");
      setInitialCash(undefined);
      setCashCounted(undefined);
    }
  }, [opened]);

  const countedValue = typeof cashCounted === "number" && Number.isFinite(cashCounted) ? cashCounted : undefined;

  if (!opened) return null;

  return (
    <Modal opened={opened} onClose={onClose} title={mode === "open" ? "Apertura de turno" : "Cierre de turno"} centered size="lg">
      <Stack gap="lg">
        {mode === "open" ? (
          <>
            <TextInput
              label="Nombre del vendedor"
              placeholder="Ej: Matías R."
              value={seller}
              onChange={(event) => setSeller(event.currentTarget.value)}
            />
            <Select
              label="Turno"
              data={SHIFT_TYPES.map((item) => ({ value: item.value, label: item.label }))}
              value={shiftType}
              onChange={(value) => setShiftType((value as ShiftType) ?? "dia")}
            />
            <NumberInput
              label="Efectivo inicial"
              placeholder="Ej: 50000"
              description="Monto de efectivo con el que inicia el turno"
              value={initialCash ?? undefined}
              onChange={(value) => {
                if (value === "" || value === null) {
                  setInitialCash(undefined);
                  return;
                }
                const parsed = typeof value === "number" ? value : Number(value);
                setInitialCash(Number.isFinite(parsed) ? parsed : undefined);
              }}
              min={0}
              thousandSeparator="."
              decimalSeparator=","
            />
            <Badge color="teal" variant="light">
              Mantén el control en tiempo real del efectivo durante el turno.
            </Badge>
            <Group justify="flex-end">
              <Button variant="default" onClick={onClose}>
                Cancelar
              </Button>
              <Button
                onClick={() => {
                  if (!seller.trim()) {
                    notifications.show({
                      title: "Campos incompletos",
                      message: "Ingresa el nombre del responsable del turno.",
                      color: "orange"
                    });
                    return;
                  }
                  const initialCashValue = typeof initialCash === "number" && Number.isFinite(initialCash) ? initialCash : undefined;
                  if (initialCashValue === undefined) {
                    notifications.show({
                      title: "Campos incompletos",
                      message: "Ingresa el efectivo inicial del turno.",
                      color: "orange"
                    });
                    return;
                  }
                  onOpenShift({ seller: seller.trim(), type: shiftType, initialCash: initialCashValue });
                }}
                leftSection={<Clock3 size={18} />}
              >
                Abrir turno
              </Button>
            </Group>
          </>
        ) : (
          <>
            <Stack gap="sm">
              <Badge color="violet" variant="light">
                Resumen del turno
              </Badge>
              <Group justify="space-between">
                <Text>Total ventas</Text>
                <Text fw={700}>{formatCurrency(summary.total)}</Text>
              </Group>
              <Group justify="space-between">
                <Text>Tickets emitidos</Text>
                <Text fw={700}>{summary.tickets}</Text>
              </Group>
              <Divider />
              <Stack gap="xs">
                {summary.byPayment && Object.entries(summary.byPayment).map(([key, value]) => (
                  <Group key={key} justify="space-between">
                    <Text c="dimmed">{key.toUpperCase()}</Text>
                    <Text fw={600}>{formatCurrency(value ?? 0)}</Text>
                  </Group>
                ))}
              </Stack>
            </Stack>
            <NumberInput
              label="Conteo final de efectivo"
              placeholder="Ej: 120000"
              value={cashCounted ?? undefined}
              onChange={(value) => {
                if (value === "" || value === null) {
                  setCashCounted(undefined);
                  return;
                }
                const parsed = typeof value === "number" ? value : Number(value);
                setCashCounted(Number.isFinite(parsed) ? parsed : undefined);
              }}
              min={0}
              thousandSeparator="."
              decimalSeparator=","
            />
            <Paper withBorder p="md" radius="md">
              <Stack gap="xs">
                <Group justify="space-between">
                  <Text>Efectivo esperado</Text>
                  <Text fw={600}>{formatCurrency(summary.cashExpected)}</Text>
                </Group>
                <Group justify="space-between">
                  <Text>Diferencia</Text>
                  <Text fw={600} c={countedValue !== undefined && countedValue - summary.cashExpected !== 0 ? (countedValue - summary.cashExpected > 0 ? "teal" : "red") : undefined}>
                    {formatCurrency(countedValue !== undefined ? countedValue - summary.cashExpected : 0)}
                  </Text>
                </Group>
              </Stack>
            </Paper>
            <Group justify="flex-end">
              <Button variant="default" onClick={onClose}>
                Cancelar
              </Button>
              <Button
                color="teal"
                leftSection={<RefreshCcw size={18} />}
                onClick={() => {
                  if (countedValue === undefined) {
                    notifications.show({
                      title: "Campos incompletos",
                      message: "Ingresa el conteo final de efectivo para cerrar el turno.",
                      color: "orange"
                    });
                    return;
                  }
                  onCloseShift({ cashCounted: countedValue });
                }}
              >
                Cerrar turno
              </Button>
            </Group>
          </>
        )}
      </Stack>
    </Modal>
  );
};

interface ClientModalProps {
  opened: boolean;
  onClose: () => void;
  onCreateClient: (payload: { name: string; limit: number; authorized: boolean }) => void;
}

const ClientModal = ({ opened, onClose, onCreateClient }: ClientModalProps) => {
  const [name, setName] = useState("");
  const [limit, setLimit] = useState<number | undefined>(undefined);
  const [authorized, setAuthorized] = useState(true);

  useEffect(() => {
    if (!opened) {
      setName("");
      setLimit(undefined);
      setAuthorized(true);
    }
  }, [opened]);

  if (!opened) return null;

  return (
    <Modal opened={opened} onClose={onClose} title="Nuevo cliente fiado" centered size="md">
      <Stack gap="lg">
        <TextInput
          label="Nombre del cliente"
          placeholder="Ej: Juan Pérez"
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
          required
        />
        <NumberInput
          label="Límite de crédito"
          placeholder="Ej: 100000"
          description="Monto máximo que el cliente puede deber"
          value={limit ?? undefined}
          onChange={(value) => {
            if (value === "" || value === null) {
              setLimit(undefined);
              return;
            }
            const parsed = typeof value === "number" ? value : Number(value);
            setLimit(Number.isFinite(parsed) ? parsed : undefined);
          }}
          min={0}
          thousandSeparator="."
          decimalSeparator=","
          required
        />
        <Switch
          label="Autorizar al cliente"
          description="Si está autorizado, podrá realizar compras a crédito inmediatamente"
          checked={authorized}
          onChange={(event) => setAuthorized(event.currentTarget.checked)}
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={() => {
              if (!name.trim()) {
                notifications.show({
                  title: "Campos incompletos",
                  message: "Ingresa el nombre del cliente.",
                  color: "orange"
                });
                return;
              }
              const limitValue = typeof limit === "number" && Number.isFinite(limit) ? limit : undefined;
              if (limitValue === undefined) {
                notifications.show({
                  title: "Campos incompletos",
                  message: "Ingresa el límite de crédito.",
                  color: "orange"
                });
                return;
              }
              onCreateClient({ name: name.trim(), limit: limitValue, authorized });
            }}
            leftSection={<UserPlus size={18} />}
          >
            Crear cliente
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};

interface AddStockModalProps {
  opened: boolean;
  onClose: () => void;
  products: Product[];
  selectedProductId: string | null;
  onConfirm: (productId: string, quantity: number, reason: string) => void;
}

const AddStockModal = ({ opened, onClose, products, selectedProductId, onConfirm }: AddStockModalProps) => {
  const [productId, setProductId] = useState<string | null>(selectedProductId);
  const [quantity, setQuantity] = useState<number | undefined>(undefined);
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (opened) {
      setProductId(selectedProductId);
      setQuantity(undefined);
      setReason("");
    }
  }, [opened, selectedProductId]);

  if (!opened) return null;

  const selectedProduct = products.find((p) => p.id === productId);

  return (
    <Modal opened={opened} onClose={onClose} title="Agregar stock" centered size="md">
      <Stack gap="lg">
        <Select
          label="Producto"
          placeholder="Selecciona un producto"
          data={products.map((p) => ({ value: p.id, label: `${p.name} - ${p.category}` }))}
          value={productId}
          onChange={setProductId}
          searchable
        />
        {selectedProduct && (
          <Paper withBorder p="sm" radius="md" style={{ background: "rgba(59,130,246,0.05)" }}>
            <Stack gap={4}>
              <Text size="sm" fw={600}>{selectedProduct.name}</Text>
              <Text size="xs" c="dimmed">Stock actual: {selectedProduct.stock} unidades</Text>
            </Stack>
          </Paper>
        )}
        <NumberInput
          label="Cantidad a agregar"
          placeholder="Ej: 50"
          value={quantity ?? undefined}
          onChange={(value) => {
            if (value === "" || value === null) {
              setQuantity(undefined);
              return;
            }
            const parsed = typeof value === "number" ? value : Number(value);
            setQuantity(Number.isFinite(parsed) && parsed > 0 ? parsed : undefined);
          }}
          min={1}
        />
        <Select
          label="Motivo"
          placeholder="Selecciona el motivo"
          data={[
            { value: "entrada", label: "Entrada de mercancía" },
            { value: "devolucion", label: "Devolución de cliente" },
            { value: "ajuste", label: "Ajuste de inventario" },
            { value: "otro", label: "Otro" }
          ]}
          value={reason}
          onChange={(val) => setReason(val ?? "")}
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={() => {
              if (!productId) {
                notifications.show({
                  title: "Producto requerido",
                  message: "Selecciona un producto",
                  color: "orange"
                });
                return;
              }
              if (!quantity || quantity <= 0) {
                notifications.show({
                  title: "Cantidad inválida",
                  message: "Ingresa una cantidad válida",
                  color: "orange"
                });
                return;
              }
              if (!reason) {
                notifications.show({
                  title: "Motivo requerido",
                  message: "Selecciona el motivo",
                  color: "orange"
                });
                return;
              }
              onConfirm(productId, quantity, reason);
            }}
            leftSection={<Plus size={18} />}
          >
            Agregar stock
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};

interface EditProductModalProps {
  opened: boolean;
  onClose: () => void;
  product: Product | null;
  categories: string[];
  onSave: (productId: string | null, updates: Partial<Product>) => void;
}

const EditProductModal = ({ opened, onClose, product, categories, onSave }: EditProductModalProps) => {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [barcode, setBarcode] = useState("");
  const [price, setPrice] = useState<number | undefined>(undefined);
  const [stock, setStock] = useState<number | undefined>(undefined);
  const [minStock, setMinStock] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (opened) {
      if (product) {
        setName(product.name);
        setCategory(product.category);
        setBarcode(product.barcode ?? "");
        setPrice(product.price);
        setStock(product.stock);
        setMinStock(product.minStock);
      } else {
        // Resetear campos para nuevo producto
        setName("");
        setCategory("");
        setBarcode("");
        setPrice(undefined);
        setStock(0);
        setMinStock(5);
      }
    }
  }, [opened, product]);

  if (!opened) return null;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={product ? "Editar producto" : "Nuevo producto"}
      centered
      size="lg"
    >
      <Stack gap="lg">
        <TextInput
          label="Nombre"
          placeholder="Ej: Yogurt natural 1L"
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
        />
        <Autocomplete
          label="Categoría"
          placeholder="Selecciona o escribe una categoría"
          data={categories}
          value={category}
          onChange={setCategory}
        />
        <TextInput
          label="Código de barras"
          placeholder="Opcional"
          value={barcode}
          onChange={(e) => setBarcode(e.currentTarget.value)}
        />
        <NumberInput
          label="Precio"
          placeholder="CLP"
          value={price ?? undefined}
          onChange={(value) => {
            if (value === "" || value === null) {
              setPrice(undefined);
              return;
            }
            const parsed = typeof value === "number" ? value : Number(value);
            setPrice(Number.isFinite(parsed) ? parsed : undefined);
          }}
          thousandSeparator="."
          decimalSeparator=","
          min={0}
        />
        <Grid gutter="md">
          <Grid.Col span={6}>
            <NumberInput
              label="Stock inicial"
              placeholder="Cantidad en inventario"
              value={stock ?? undefined}
              onChange={(value) => {
                if (value === "" || value === null) {
                  setStock(undefined);
                  return;
                }
                const parsed = typeof value === "number" ? value : Number(value);
                setStock(Number.isFinite(parsed) ? parsed : undefined);
              }}
              min={0}
            />
          </Grid.Col>
          <Grid.Col span={6}>
            <NumberInput
              label="Stock mínimo"
              placeholder="Cantidad mínima de alerta"
              value={minStock ?? undefined}
              onChange={(value) => {
                if (value === "" || value === null) {
                  setMinStock(undefined);
                  return;
                }
                const parsed = typeof value === "number" ? value : Number(value);
                setMinStock(Number.isFinite(parsed) ? parsed : undefined);
              }}
              min={0}
            />
          </Grid.Col>
        </Grid>
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={() => {
              if (!name.trim()) {
                notifications.show({
                  title: "Nombre requerido",
                  message: "Ingresa el nombre del producto",
                  color: "orange"
                });
                return;
              }
              if (!category.trim()) {
                notifications.show({
                  title: "Categoría requerida",
                  message: "Ingresa la categoría",
                  color: "orange"
                });
                return;
              }
              if (price === undefined || price <= 0) {
                notifications.show({
                  title: "Precio inválido",
                  message: "Ingresa un precio válido",
                  color: "orange"
                });
                return;
              }
              onSave(product?.id ?? null, {
                name: name.trim(),
                category: category.trim(),
                barcode: barcode.trim() || null,
                price,
                stock: stock ?? 0,
                minStock: minStock ?? 5
              });
              onClose();
            }}
            leftSection={product ? <Edit size={18} /> : <Plus size={18} />}
          >
            {product ? "Guardar cambios" : "Crear producto"}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};

interface ReturnDrawerProps {
  opened: boolean;
  sales: Sale[];
  value: string | null;
  onClose: () => void;
  onSelectSale: (saleId: string | null) => void;
  items: Record<string, number>;
  onChangeItem: (itemId: string, quantity: number) => void;
  reason: string;
  onChangeReason: (value: string) => void;
  refundMethod: "cash" | "card" | "product";
  onChangeRefundMethod: (value: "cash" | "card" | "product") => void;
  onConfirm: () => void;
}

const ReturnDrawer = ({
  opened,
  sales,
  value,
  onClose,
  onSelectSale,
  items,
  onChangeItem,
  reason,
  onChangeReason,
  refundMethod,
  onChangeRefundMethod,
  onConfirm
}: ReturnDrawerProps) => {
  const selectedSale = sales.find((sale) => sale.id === value);
  const totalReturn = selectedSale
    ? selectedSale.items.reduce((acc, item) => acc + (items[item.id] ?? 0) * item.price, 0)
    : 0;

  return (
    <Drawer opened={opened} onClose={onClose} title="Gestionar devolución" position="right" size="lg">
      <Stack gap="lg">
        <Select
          label="Selecciona la venta"
          placeholder="Busca por ticket"
          searchable
          data={sales.map((sale) => ({
            value: sale.id,
            label: `#${sale.ticket} • ${formatDateTime(sale.created_at)} • ${formatCurrency(sale.total)}`
          }))}
          value={value}
          onChange={(val) => onSelectSale(val)}
        />
        {selectedSale ? (
          <Stack gap="md">
            <Text fw={600}>Productos vendidos</Text>
            <Stack gap="sm">
              {selectedSale.items.map((item) => (
                <Paper withBorder p="md" radius="md" key={item.id}>
                  <Group justify="space-between" align="center">
                    <div>
                      <Text fw={600}>{item.name}</Text>
                      <Text size="sm" c="dimmed">
                        Vendido: {item.quantity} • {formatCurrency(item.price)}
                      </Text>
                    </div>
                    <NumberInput
                      size="sm"
                      style={{ width: 140 }}
                      min={0}
                      max={item.quantity}
                      value={items[item.id] ?? 0}
                      onChange={(value) => onChangeItem(item.id, Number(value))}
                    />
                  </Group>
                </Paper>
              ))}
            </Stack>
            <TextInput
              label="Motivo"
              placeholder="Producto en mal estado, vencido, error de cobro..."
              value={reason}
              onChange={(event) => onChangeReason(event.currentTarget.value)}
            />
            <Select
              label="Método de devolución"
              description="Selecciona cómo se devolverá el dinero al cliente"
              value={refundMethod}
              onChange={(val) => onChangeRefundMethod(val as "cash" | "card" | "product")}
              data={[
                { value: "cash", label: "Efectivo" },
                { value: "card", label: "Tarjeta" },
                { value: "product", label: "Cambio por producto" }
              ]}
            />
            <Paper withBorder p="md" radius="md">
              <Group justify="space-between">
                <Text>Total a devolver</Text>
                <Text fw={700}>{formatCurrency(totalReturn)}</Text>
              </Group>
            </Paper>
            <Button
              color="red"
              leftSection={<Receipt size={18} />}
              onClick={() => {
                if (totalReturn <= 0) {
                  notifications.show({
                    title: "Sin cambios",
                    message: "Selecciona al menos un producto a devolver.",
                    color: "orange"
                  });
                  return;
                }
                onConfirm();
              }}
            >
              Registrar devolución
            </Button>
          </Stack>
        ) : (
          <Paper withBorder radius="md" p="lg">
            <Text c="dimmed">Selecciona una venta para gestionar la devolución.</Text>
          </Paper>
        )}
      </Stack>
    </Drawer>
  );
};

interface PaymentEditModalProps {
  sale: Sale | null;
  opened: boolean;
  onClose: () => void;
  onSave: (method: PaymentMethod) => void;
}

const PaymentEditModal = ({ sale, opened, onClose, onSave }: PaymentEditModalProps) => {
  const [method, setMethod] = useState<PaymentMethod>("cash");

  useEffect(() => {
    if (sale) {
      setMethod(sale.paymentMethod);
    }
  }, [sale]);

  if (!sale) return null;

  return (
    <Modal opened={opened} onClose={onClose} title="Cambiar método de pago" centered>
      <Stack>
        <Text>
          Ticket #{sale.ticket} • {formatCurrency(sale.total)}
        </Text>
        <Select
          label="Nuevo método"
          value={method}
          onChange={(value) => setMethod((value as PaymentMethod) ?? "cash")}
          data={PAYMENT_OPTIONS.map((option) => ({
            value: option.id,
            label: option.label
          }))}
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            leftSection={<RefreshCcw size={18} />}
            onClick={() => onSave(method)}
          >
            Guardar cambios
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};

interface FiadoPaymentModalProps {
  opened: boolean;
  client: Client | null;
  mode: "abono" | "total";
  onClose: () => void;
  onSubmit: (payload: { amount: number; description: string }) => void;
}

const FiadoPaymentModal = ({ opened, client, mode, onClose, onSubmit }: FiadoPaymentModalProps) => {
  const [amount, setAmount] = useState<number | undefined>(undefined);
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (opened) {
      setAmount(mode === "total" ? client?.balance ?? 0 : undefined);
      setDescription("");
    }
  }, [opened, client, mode]);

  if (!client) return null;

  const maxAmount = client.balance;

  return (
    <Modal opened={opened} onClose={onClose} title="Gestión de fiados" centered>
      <Stack>
        <Text fw={600}>{client.name}</Text>
        <Text c="dimmed">Saldo actual: {formatCurrency(client.balance)}</Text>
        <NumberInput
          label={mode === "total" ? "Monto a cancelar" : "Monto del abono"}
          min={0}
          max={maxAmount}
          value={amount ?? undefined}
          onChange={(value) => {
            if (value === "" || value === null) {
              setAmount(undefined);
              return;
            }
            const parsed = typeof value === "number" ? value : Number(value);
            setAmount(Number.isFinite(parsed) ? parsed : undefined);
          }}
          thousandSeparator="."
          decimalSeparator=","
        />
        {mode === "abono" && (
          <TextInput
            label="Glosa"
            placeholder="Detalle del abono"
            value={description}
            onChange={(event) => setDescription(event.currentTarget.value)}
          />
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            leftSection={<PiggyBank size={18} />}
            onClick={() => {
              if (amount === undefined || amount <= 0) {
                notifications.show({
                  title: "Monto inválido",
                  message: "Ingresa un monto válido para registrar el movimiento.",
                  color: "orange"
                });
                return;
              }
              if (amount > client.balance) {
                notifications.show({
                  title: "Excede el saldo",
                  message: "El monto supera el saldo actual del cliente.",
                  color: "red"
                });
                return;
              }
              onSubmit({ amount, description: description.trim() });
            }}
          >
            Registrar
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};

const App = () => {
  const queryClient = useQueryClient();
  const isMobile = useMediaQuery("(max-width: 768px)");
  const { colorScheme, setColorScheme } = useMantineColorScheme();

  const [activeTab, setActiveTab] = useState<TabId>("dashboard");
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [pendingTab, setPendingTab] = useState<TabId | null>(null);
  const [passwordModalOpened, passwordModalHandlers] = useDisclosure(false);

  const [cart, setCart] = useState<CartLine[]>([]);
  const [search, setSearch] = useState("");
  const [selectedPayment, setSelectedPayment] = useState<PaymentMethod>("cash");
  const [cashReceived, setCashReceived] = useState<number | undefined>(undefined);
  const [selectedFiadoClient, setSelectedFiadoClient] = useState<string | null>(null);
  const [customerDisplay, setCustomerDisplay] = useState(false);

  const [shiftModalOpened, shiftModalHandlers] = useDisclosure(false);
  const [shiftModalMode, setShiftModalMode] = useState<"open" | "close">("open");

  const [returnDrawerOpened, returnDrawerHandlers] = useDisclosure(false);
  const [returnSaleId, setReturnSaleId] = useState<string | null>(null);
  const [returnItems, setReturnItems] = useState<Record<string, number>>({});
  const [returnReason, setReturnReason] = useState("");
  const [returnRefundMethod, setReturnRefundMethod] = useState<"cash" | "card" | "product">("cash");

  const [paymentEditSaleId, setPaymentEditSaleId] = useState<string | null>(null);

  const [fiadoModalOpened, fiadoModalHandlers] = useDisclosure(false);
  const [fiadoModalClientId, setFiadoModalClientId] = useState<string | null>(null);
  const [fiadoModalMode, setFiadoModalMode] = useState<"abono" | "total">("abono");

  const [clientModalOpened, clientModalHandlers] = useDisclosure(false);

  // Inventory states
  const [inventorySearch, setInventorySearch] = useState("");
  const [inventoryCategoryFilter, setInventoryCategoryFilter] = useState<string | null>(null);
  const [inventoryStockFilter, setInventoryStockFilter] = useState<"all" | "low" | "out">("all");
  const [addStockModalOpened, addStockModalHandlers] = useDisclosure(false);
  const [editProductModalOpened, editProductModalHandlers] = useDisclosure(false);
  const [selectedProductForStock, setSelectedProductForStock] = useState<string | null>(null);
  const [selectedProductForEdit, setSelectedProductForEdit] = useState<Product | null>(null);

  const [reportFilters, setReportFilters] = useState<ReportFilters>({ range: "today" });
  const [now, setNow] = useState(dayjs());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(dayjs()), 60000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (adminUnlocked && pendingTab) {
      setActiveTab(pendingTab);
      setPendingTab(null);
    }
  }, [adminUnlocked, pendingTab]);

  const productQuery = useQuery({
    queryKey: ["products"],
    queryFn: fetchProducts,
    initialData: FALLBACK_PRODUCTS
  });

  const clientsQuery = useQuery({
    queryKey: ["clients"],
    queryFn: fetchClients,
    initialData: FALLBACK_CLIENTS
  });

  const salesQuery = useQuery({
    queryKey: ["sales"],
    queryFn: fetchSales,
    initialData: FALLBACK_SALES
  });

  const shiftsQuery = useQuery({
    queryKey: ["shifts"],
    queryFn: fetchShifts,
    initialData: FALLBACK_SHIFTS
  });

  const products = productQuery.data ?? [];
  const clients = clientsQuery.data ?? [];
  const sales = salesQuery.data ?? [];
  const shifts = shiftsQuery.data ?? [];
  const activeShift = useMemo(() => shifts.find((shift) => shift.status === "open"), [shifts]);
  const shiftSummary = useMemo(() => computeShiftSummary(sales, activeShift?.id ?? null), [sales, activeShift]);

  const productMap = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const cartDetailed = useMemo(() => {
    return cart
      .map((line) => {
        const product = productMap.get(line.productId);
        if (!product) return null;
        return {
          product,
          quantity: line.quantity,
          subtotal: product.price * line.quantity
        };
      })
      .filter(Boolean) as { product: Product; quantity: number; subtotal: number }[];
  }, [cart, productMap]);

  const cartTotals = useMemo(() => {
    const total = cartDetailed.reduce((acc, item) => acc + item.subtotal, 0);
    const items = cartDetailed.reduce((acc, item) => acc + item.quantity, 0);
    const cashValue =
      selectedPayment === "cash" && typeof cashReceived === "number" && Number.isFinite(cashReceived)
        ? cashReceived
        : undefined;
    const change = cashValue !== undefined ? cashValue - total : 0;
    return { total, items, change };
  }, [cartDetailed, selectedPayment, cashReceived]);

  const paymentOption = PAYMENT_OPTIONS.find((option) => option.id === selectedPayment);

  const filteredProducts = useMemo(() => {
    if (!search.trim()) return products;
    const term = search.toLowerCase();
    return products.filter(
      (product) =>
        product.name.toLowerCase().includes(term) ||
        product.category.toLowerCase().includes(term) ||
        (product.barcode && product.barcode.includes(term))
    );
  }, [products, search]);

  const lowStockProducts = useMemo(() => products.filter((product) => product.stock <= product.minStock), [products]);

  const autoCompleteData = useMemo(() => products.map((product) => product.name), [products]);

  const guardTabChange = (tab: TabId) => {
    const target = TABS.find((item) => item.id === tab);
    if (target?.adminOnly && !adminUnlocked) {
      setPendingTab(tab);
      passwordModalHandlers.open();
      return;
    }
    setActiveTab(tab);
  };

  const handleLockAdmin = () => {
    setAdminUnlocked(false);
    setPendingTab(null);
    setActiveTab("pos");
    notifications.show({
      title: "Modo administrativo desactivado",
      message: "Las secciones sensibles quedaron bloqueadas nuevamente.",
      color: "blue"
    });
  };

  const handleSelectPayment = (paymentId: PaymentMethod) => {
    setSelectedPayment(paymentId);
    if (paymentId !== "cash") {
      setCashReceived(undefined);
    }
    if (paymentId !== "fiado") {
      setSelectedFiadoClient(null);
    }
  };

  const handleAddProductToCart = (productId: string) => {
    const product = productMap.get(productId);
    if (!product) return;

    setCart((prev) => {
      const existing = prev.find((item) => item.productId === productId);
      const newQuantity = (existing?.quantity ?? 0) + 1;
      if (newQuantity > product.stock) {
        notifications.show({
          title: "Stock insuficiente",
          message: `No quedan unidades suficientes de ${product.name}.`,
          color: "red"
        });
        return prev;
      }
      if (existing) {
        return prev.map((item) =>
          item.productId === productId ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { productId, quantity: 1 }];
    });

    notifications.show({
      title: "Producto agregado",
      message: `${product.name} se agregó al carrito.`,
      color: "teal"
    });
  };

  const handleUpdateCartQuantity = (productId: string, quantity: number) => {
    const product = productMap.get(productId);
    if (!product) return;
    if (quantity <= 0) {
      setCart((prev) => prev.filter((item) => item.productId !== productId));
      return;
    }
    if (quantity > product.stock) {
      notifications.show({
        title: "Sin stock",
        message: "No hay stock suficiente para la cantidad seleccionada.",
        color: "red"
      });
      return;
    }
    setCart((prev) =>
      prev.map((item) => (item.productId === productId ? { ...item, quantity } : item))
    );
  };

  const handleRemoveCartItem = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.productId !== productId));
  };

  const validateSale = () => {
    if (cartDetailed.length === 0) {
      notifications.show({
        title: "Carrito vacío",
        message: "Agrega productos antes de generar la venta.",
        color: "red"
      });
      return false;
    }
    if (selectedPayment === "cash") {
      const cashValue = typeof cashReceived === "number" && Number.isFinite(cashReceived) ? cashReceived : undefined;
      if (cashValue === undefined || cashValue <= 0) {
        notifications.show({
          title: "Efectivo requerido",
          message: "Registra el monto recibido para controlar el cambio.",
          color: "orange"
        });
        return false;
      }
      if (cashValue < cartTotals.total) {
        notifications.show({
          title: "Efectivo insuficiente",
          message: "El monto recibido es inferior al total de la venta.",
          color: "red"
        });
        return false;
      }
    }
    if (selectedPayment === "fiado") {
      if (!selectedFiadoClient) {
        notifications.show({
          title: "Cliente requerido",
          message: "Debes seleccionar un cliente autorizado para fiar.",
          color: "orange"
        });
        return false;
      }
      const client = clients.find((item) => item.id === selectedFiadoClient);
      if (!client || !client.authorized) {
        notifications.show({
          title: "Cliente no autorizado",
          message: "Selecciona un cliente con autorización para fiado.",
          color: "red"
        });
        return false;
      }
      const projected = client.balance + cartTotals.total;
      if (projected > client.limit) {
        notifications.show({
          title: "Límite excedido",
          message: "La compra supera el límite de crédito del cliente.",
          color: "red"
        });
        return false;
      }
    }
    if (selectedPayment === "staff" && !activeShift) {
      notifications.show({
        title: "Turno requerido",
        message: "Inicia un turno para registrar consumos del personal.",
        color: "orange"
      });
      return false;
    }
    return true;
  };

  const handleCompleteSale = async () => {
    if (!validateSale()) return;

    const timestamp = new Date().toISOString();
    const ticket = String((sales[0]?.ticket ? Number(sales[0].ticket) + 1 : sales.length + 1)).padStart(6, "0");
    const saleItems: SaleItem[] = cartDetailed.map((item) => ({
      id: generateId(),
      productId: item.product.id,
      name: item.product.name,
      price: item.product.price,
      quantity: item.quantity
    }));

    const cashValue =
      selectedPayment === "cash" && typeof cashReceived === "number" && Number.isFinite(cashReceived)
        ? cashReceived
        : null;

    const payload = {
      ticket,
      type: "sale",
      total: cartTotals.total,
      payment_method: selectedPayment,
      cash_received: cashValue,
      change_amount: cashValue !== null ? cartTotals.change : null,
      shift_id: activeShift?.id ?? null,
      seller: activeShift?.seller ?? "Mostrador",
      created_at: timestamp,
      items: saleItems,
      notes: selectedPayment === "fiado" ? { clientId: selectedFiadoClient } : null
    };

    const { error } = await supabase.from("elianamaipu_sales").insert(payload);

    if (error) {
      notifications.show({
        title: "Error al registrar la venta",
        message: error.message,
        color: "red"
      });
      return;
    }

    await Promise.all(
      saleItems.map((item) =>
        supabase
          .from("elianamaipu_products")
          .update({ stock: (productMap.get(item.productId)?.stock ?? 0) - item.quantity })
          .eq("id", item.productId)
      )
    );

    if (selectedPayment === "fiado" && selectedFiadoClient) {
      const client = clients.find((item) => item.id === selectedFiadoClient);
      if (client) {
        const newBalance = client.balance + cartTotals.total;
        await supabase
          .from("elianamaipu_clients")
          .update({ balance: newBalance })
          .eq("id", client.id);
        await supabase.from("elianamaipu_client_movements").insert({
          client_id: client.id,
          amount: cartTotals.total,
          type: "fiado",
          description: `Compra ticket #${ticket}`,
          balance_after: newBalance
        });
      }
    }

    notifications.show({
      title: "Venta registrada",
      message: `Ticket #${ticket} generado correctamente.`,
      color: "teal"
    });

    setCart([]);
    setCashReceived(undefined);
    setSelectedFiadoClient(null);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["products"] }),
      queryClient.invalidateQueries({ queryKey: ["sales"] }),
      queryClient.invalidateQueries({ queryKey: ["clients"] })
    ]);
  };

  const handleOpenShift = async ({ seller, type, initialCash }: { seller: string; type: ShiftType; initialCash: number }) => {
    const { error } = await supabase.from("elianamaipu_shifts").insert({
      seller,
      type,
      start_time: new Date().toISOString(),
      status: "open",
      initial_cash: initialCash
    });

    if (error) {
      notifications.show({
        title: "No se pudo abrir el turno",
        message: error.message,
        color: "red"
      });
      return;
    }

    notifications.show({
      title: "Turno iniciado",
      message: `Turno ${type === "dia" ? "día" : "noche"} para ${seller} con ${formatCurrency(initialCash)} inicial.`,
      color: "teal"
    });
    await queryClient.invalidateQueries({ queryKey: ["shifts"] });
    shiftModalHandlers.close();
  };

  const handleCloseShift = async ({ cashCounted }: { cashCounted: number }) => {
    if (!activeShift) return;
    const summary = computeShiftSummary(sales, activeShift.id);
    const initialCash = activeShift.initial_cash ?? 0;
    const cashExpected = initialCash + (summary.byPayment.cash ?? 0);
    const difference = cashCounted - cashExpected;
    const { error } = await supabase
      .from("elianamaipu_shifts")
      .update({
        end_time: new Date().toISOString(),
        status: "closed",
        cash_counted: cashCounted,
        cash_expected: cashExpected,
        difference,
        total_sales: summary.total,
        tickets: summary.tickets,
        payments_breakdown: summary.byPayment
      })
      .eq("id", activeShift.id);

    if (error) {
      notifications.show({
        title: "No se pudo cerrar el turno",
        message: error.message,
        color: "red"
      });
      return;
    }

    notifications.show({
      title: "Turno cerrado",
      message: "Se registró el cierre de caja correctamente.",
      color: difference === 0 ? "teal" : difference > 0 ? "green" : "orange"
    });

    await queryClient.invalidateQueries({ queryKey: ["shifts"] });
    shiftModalHandlers.close();
  };

  const handleCreateProduct = async (payload: ProductInput) => {
    const { error } = await supabase.from("elianamaipu_products").insert({
      name: payload.name,
      category: payload.category,
      barcode: payload.barcode,
      price: payload.price,
      stock: payload.stock,
      min_stock: payload.minStock
    });

    if (error) {
      notifications.show({
        title: "No se pudo registrar el producto",
        message: error.message,
        color: "red"
      });
      return;
    }

    notifications.show({
      title: "Producto agregado",
      message: `${payload.name} ya forma parte del inventario.`,
      color: "teal"
    });
    await queryClient.invalidateQueries({ queryKey: ["products"] });
  };

  const handleAddStock = async (productId: string, quantity: number, reason: string) => {
    const product = products.find((p) => p.id === productId);
    if (!product) return;

    const newStock = product.stock + quantity;
    const { error } = await supabase
      .from("elianamaipu_products")
      .update({ stock: newStock })
      .eq("id", productId);

    if (error) {
      notifications.show({
        title: "No se pudo actualizar el stock",
        message: error.message,
        color: "red"
      });
      return;
    }

    notifications.show({
      title: "Stock actualizado",
      message: `${product.name}: +${quantity} unidades (${reason})`,
      color: "teal"
    });

    await queryClient.invalidateQueries({ queryKey: ["products"] });
    addStockModalHandlers.close();
    setSelectedProductForStock(null);
  };

  const handleEditProduct = async (productId: string, updates: Partial<ProductInput>) => {
    const product = products.find((p) => p.id === productId);
    if (!product) return;

    const payload: any = {};
    if (updates.name !== undefined) payload.name = updates.name;
    if (updates.category !== undefined) payload.category = updates.category;
    if (updates.barcode !== undefined) payload.barcode = updates.barcode;
    if (updates.price !== undefined) payload.price = updates.price;
    if (updates.stock !== undefined) payload.stock = updates.stock;
    if (updates.minStock !== undefined) payload.min_stock = updates.minStock;

    const { error } = await supabase
      .from("elianamaipu_products")
      .update(payload)
      .eq("id", productId);

    if (error) {
      notifications.show({
        title: "No se pudo actualizar el producto",
        message: error.message,
        color: "red"
      });
      return;
    }

    notifications.show({
      title: "Producto actualizado",
      message: `${updates.name ?? product.name} se actualizó correctamente.`,
      color: "teal"
    });

    await queryClient.invalidateQueries({ queryKey: ["products"] });
    editProductModalHandlers.close();
    setSelectedProductForEdit(null);
  };

  const handleRegisterReturn = async () => {
    const sale = sales.find((item) => item.id === returnSaleId);
    if (!sale) return;
    const items = sale.items
      .map((item) => ({
        ...item,
        quantity: Math.min(item.quantity, returnItems[item.id] ?? 0)
      }))
      .filter((item) => item.quantity > 0);
    const totalReturn = items.reduce((acc, item) => acc + item.price * item.quantity, 0);
    if (items.length === 0 || totalReturn <= 0) {
      notifications.show({
        title: "Sin cambios",
        message: "Selecciona cantidades a devolver.",
        color: "orange"
      });
      return;
    }

    const timestamp = new Date().toISOString();
    const returnTicket = `R-${sale.ticket}`;

    const { error } = await supabase.from("elianamaipu_sales").insert({
      ticket: returnTicket,
      type: "return",
      total: totalReturn,
      payment_method: returnRefundMethod,
      shift_id: sale.shiftId,
      seller: sale.seller,
      created_at: timestamp,
      items,
      notes: {
        reason: returnReason,
        originalTicket: sale.ticket,
        originalPaymentMethod: sale.paymentMethod,
        refundMethod: returnRefundMethod
      }
    });

    if (error) {
      notifications.show({
        title: "No se pudo registrar la devolución",
        message: error.message,
        color: "red"
      });
      return;
    }

    await Promise.all(
      items.map((item) =>
        supabase
          .from("elianamaipu_products")
          .update({ stock: (productMap.get(item.productId)?.stock ?? 0) + item.quantity })
          .eq("id", item.productId)
      )
    );

    const refundMethodLabel = returnRefundMethod === "cash" ? "en efectivo" : returnRefundMethod === "card" ? "por tarjeta" : "por cambio de producto";
    notifications.show({
      title: "Devolución registrada",
      message: `Se devolvieron ${formatCurrency(totalReturn)} ${refundMethodLabel} al cliente.`,
      color: "teal"
    });

    setReturnItems({});
    setReturnSaleId(null);
    setReturnReason("");
    setReturnRefundMethod("cash");
    returnDrawerHandlers.close();
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["sales"] }),
      queryClient.invalidateQueries({ queryKey: ["products"] })
    ]);
  };

  const handleChangePaymentMethod = async (saleId: string, method: PaymentMethod) => {
    const { error } = await supabase
      .from("elianamaipu_sales")
      .update({ payment_method: method })
      .eq("id", saleId);

    if (error) {
      notifications.show({
        title: "No se pudo actualizar el método",
        message: error.message,
        color: "red"
      });
      return;
    }

    notifications.show({
      title: "Método actualizado",
      message: "Se cambió el método de pago del ticket seleccionado.",
      color: "teal"
    });
    setPaymentEditSaleId(null);
    await queryClient.invalidateQueries({ queryKey: ["sales"] });
  };

  const handleFiadoMovement = async ({ clientId, mode, amount, description }: { clientId: string; mode: "abono" | "total"; amount: number; description: string }) => {
    const client = clients.find((item) => item.id === clientId);
    if (!client) return;
    const newBalance = mode === "total" ? 0 : Math.max(client.balance - amount, 0);
    const { error } = await supabase
      .from("elianamaipu_clients")
      .update({ balance: newBalance })
      .eq("id", clientId);

    if (error) {
      notifications.show({
        title: "No se pudo registrar el movimiento",
        message: error.message,
        color: "red"
      });
      return;
    }

    const movement: Partial<ClientMovement> = {
      client_id: clientId,
      amount,
      type: mode === "total" ? "pago-total" : "abono",
      description: mode === "total" ? "Pago total de la deuda" : description || "Abono registrado",
      balance_after: newBalance,
      created_at: new Date().toISOString()
    };

    await supabase.from("elianamaipu_client_movements").insert(movement);

    notifications.show({
      title: "Movimiento registrado",
      message: "Se actualizó la deuda del cliente.",
      color: "teal"
    });
    await queryClient.invalidateQueries({ queryKey: ["clients"] });
  };

  const handleAuthorizeFiado = async (clientId: string, authorized: boolean) => {
    const { error } = await supabase
      .from("elianamaipu_clients")
      .update({ authorized })
      .eq("id", clientId);

    if (error) {
      notifications.show({
        title: "No se pudo actualizar el estado",
        message: error.message,
        color: "red"
      });
      return;
    }

    notifications.show({
      title: "Actualizado",
      message: "Se modificó la autorización del cliente.",
      color: "teal"
    });
    await queryClient.invalidateQueries({ queryKey: ["clients"] });
  };

  const handleCreateClient = async ({ name, limit, authorized }: { name: string; limit: number; authorized: boolean }) => {
    const { error } = await supabase.from("elianamaipu_clients").insert({
      name,
      authorized,
      balance: 0,
      "limit": limit
    });

    if (error) {
      notifications.show({
        title: "No se pudo crear el cliente",
        message: error.message,
        color: "red"
      });
      return;
    }

    notifications.show({
      title: "Cliente creado",
      message: `${name} fue agregado exitosamente con límite de ${formatCurrency(limit)}.`,
      color: "teal"
    });
    await queryClient.invalidateQueries({ queryKey: ["clients"] });
    clientModalHandlers.close();
  };

  const filteredSalesForReports = useMemo(() => {
    const now = dayjs();
    let start: dayjs.Dayjs | null = null;
    let end: dayjs.Dayjs | null = null;

    switch (reportFilters.range) {
      case "today":
        start = now.startOf("day");
        end = now.endOf("day");
        break;
      case "week":
        start = now.startOf("week");
        end = now.endOf("week");
        break;
      case "month":
        start = now.startOf("month");
        end = now.endOf("month");
        break;
      case "custom":
        start = reportFilters.from ? dayjs(reportFilters.from) : null;
        end = reportFilters.to ? dayjs(reportFilters.to) : null;
        break;
      default:
        break;
    }

    return sales.filter((sale) => {
      if (sale.type === "return") return false;
      const date = dayjs(sale.created_at);
      if (start && date.isBefore(start)) return false;
      if (end && date.isAfter(end)) return false;
      return true;
    });
  }, [sales, reportFilters]);

  const reportSummary = useMemo(() => {
    const total = filteredSalesForReports.reduce((acc, sale) => acc + sale.total, 0);
    const tickets = filteredSalesForReports.length;
    const byPayment = filteredSalesForReports.reduce<Record<PaymentMethod, number>>(
      (acc, sale) => {
        acc[sale.paymentMethod] += sale.total;
        return acc;
      },
      { cash: 0, card: 0, transfer: 0, fiado: 0, staff: 0 }
    );
    const productMap = new Map<string, { id: string; name: string; total: number; quantity: number }>();
    filteredSalesForReports.forEach((sale) => {
      sale.items.forEach((item) => {
        const target = productMap.get(item.productId) ?? { id: item.productId, name: item.name, total: 0, quantity: 0 };
        target.total += item.price * item.quantity;
        target.quantity += item.quantity;
        productMap.set(item.productId, target);
      });
    });
    const topProducts = Array.from(productMap.values()).sort((a, b) => b.quantity - a.quantity).slice(0, 20);
    const bySeller = filteredSalesForReports.reduce<Record<string, { seller: string; total: number; tickets: number }>>(
      (acc, sale) => {
        const key = sale.seller ?? "Mostrador";
        const entry = acc[key] ?? { seller: key, total: 0, tickets: 0 };
        entry.total += sale.total;
        entry.tickets += 1;
        acc[key] = entry;
        return acc;
      },
      {}
    );

    return {
      total,
      tickets,
      byPayment,
      topProducts,
      bySeller: Object.values(bySeller)
    };
  }, [filteredSalesForReports]);

  const shiftHistory = useMemo(
    () =>
      shifts
        .filter((shift) => shift.status === "closed")
        .sort((a, b) => dayjs(b.end ?? b.start).valueOf() - dayjs(a.end ?? a.start).valueOf()),
    [shifts]
  );

  const currentTab = useMemo(() => TABS.find((tab) => tab.id === activeTab), [activeTab]);

  return (
    <AppShell
      header={{ height: 72 }}
      navbar={{
        width: 280,
        breakpoint: "md",
        collapsed: { mobile: true }
      }}
      padding="lg"
    >
      <AppShell.Header
        style={{
          background: "linear-gradient(110deg, #1e3a8a 0%, #312e81 40%, #0f172a 100%)",
          borderBottom: "none",
          boxShadow: "0 18px 45px rgba(15, 23, 42, 0.35)"
        }}
      >
        <Group
          justify="space-between"
          align="center"
          h="100%"
          px="md"
          wrap="nowrap"
          gap="xs"
        >
          <Group gap="xs" align="center" wrap="nowrap">
            <ThemeIcon
              size={38}
              radius="lg"
              variant="gradient"
              gradient={{ from: "blue.4", to: "cyan.4", deg: 120 }}
            >
              <LayoutDashboard size={20} />
            </ThemeIcon>
            <Stack gap={0} style={{ color: "white" }}>
              <Text fw={700} fz={16} lh={1.2}>
                Negocio Eliana Maipú
              </Text>
              <Text fz="xs" style={{ color: "rgba(255,255,255,0.75)" }}>
                {now.format("ddd, D MMM • HH:mm")}
              </Text>
            </Stack>
          </Group>
          <Group gap="xs" align="center" wrap="nowrap">
            {activeShift && (
              <Badge
                size="md"
                variant="light"
                style={{ background: "rgba(255,255,255,0.18)", color: "white", padding: "0.4rem 0.75rem" }}
              >
                {activeShift.seller} • {activeShift.type === "dia" ? "Día" : "Noche"}
              </Badge>
            )}
            {adminUnlocked && (
              <ActionIcon
                variant="light"
                color="yellow"
                size="md"
                radius="md"
                onClick={handleLockAdmin}
                style={{ background: "rgba(255,255,255,0.18)" }}
              >
                <KeyRound size={16} />
              </ActionIcon>
            )}
            {activeShift ? (
              <Button
                size="xs"
                variant="light"
                color="red"
                onClick={() => {
                  if (!activeShift) {
                    notifications.show({
                      title: "Sin turno activo",
                      message: "No hay un turno abierto para cerrar.",
                      color: "orange"
                    });
                    return;
                  }
                  setShiftModalMode("close");
                  shiftModalHandlers.open();
                }}
                style={{ background: "rgba(255,255,255,0.18)", color: "white" }}
              >
                Cerrar
              </Button>
            ) : (
              <Button
                size="xs"
                variant="light"
                color="teal"
                onClick={() => {
                  setShiftModalMode("open");
                  shiftModalHandlers.open();
                }}
                style={{ background: "rgba(255,255,255,0.18)", color: "white" }}
              >
                Abrir
              </Button>
            )}
            <ActionIcon
              variant="light"
              size="md"
              radius="md"
              onClick={() => setCustomerDisplay((prev) => !prev)}
              style={{
                background: customerDisplay ? "rgba(248,113,113,0.25)" : "rgba(255,255,255,0.18)"
              }}
            >
              <MonitorPlay size={16} color="white" />
            </ActionIcon>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="md" className="sidebar-nav">
        <Stack gap="md">
          <Paper withBorder radius="lg" p="md">
            {activeShift ? (
              <Stack gap="sm">
                <Group justify="space-between" align="flex-start">
                  <Stack gap={2}>
                    <Text fw={700}>Turno activo</Text>
                    <Text size="xs" c="dimmed">
                      {activeShift.seller} • desde {formatDateTime(activeShift.start)}
                    </Text>
                  </Stack>
                  <Badge color="teal" variant="light">
                    {activeShift.type === "dia" ? "Día" : "Noche"}
                  </Badge>
                </Group>
                <Divider />
                <Group justify="space-between">
                  <Text size="sm" c="dimmed">
                    Total ventas
                  </Text>
                  <Text fw={700}>{formatCurrency(shiftSummary.total)}</Text>
                </Group>
                <Group justify="space-between">
                  <Text size="sm" c="dimmed">
                    Tickets
                  </Text>
                  <Text fw={700}>{shiftSummary.tickets}</Text>
                </Group>
                <Divider />
                <Group justify="space-between">
                  <Text size="sm" c="dimmed" fw={600}>
                    Efectivo en caja
                  </Text>
                  <Text fw={700} c="teal">
                    {formatCurrency((activeShift.initial_cash ?? 0) + (shiftSummary.byPayment.cash ?? 0))}
                  </Text>
                </Group>
                <Text size="xs" c="dimmed" pl="xs">
                  Inicial: {formatCurrency(activeShift.initial_cash ?? 0)} + Ventas: {formatCurrency(shiftSummary.byPayment.cash ?? 0)}
                </Text>
                <Divider />
                {PAYMENT_ORDER.map((method) => (
                  <Group key={method} justify="space-between">
                    <Text size="xs" c="dimmed">
                      {PAYMENT_LABELS[method].toUpperCase()}
                    </Text>
                    <Text fw={600}>{formatCurrency(shiftSummary.byPayment[method] ?? 0)}</Text>
                  </Group>
                ))}
              </Stack>
            ) : (
              <Stack gap="xs">
                <Text fw={700}>Sin turno activo</Text>
                <Text size="sm" c="dimmed">
                  Registra la apertura desde el encabezado para comenzar a mostrar indicadores.
                </Text>
              </Stack>
            )}
          </Paper>

          <Stack gap="xs">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              const disabled = tab.adminOnly && !adminUnlocked;
              const lowStockCount = tab.id === "inventory" ? products.filter((p) => p.stock <= p.minStock).length : 0;

              return (
                <div
                  key={tab.id}
                  className={`nav-item ${isActive ? "active" : ""}`}
                  onClick={() => guardTabChange(tab.id)}
                  style={{ opacity: disabled ? 0.55 : 1 }}
                >
                  <div className="nav-item-icon">
                    <Icon size={22} />
                  </div>
                  <Text style={{ flex: 1 }}>{tab.label}</Text>
                  {lowStockCount > 0 && !disabled && (
                    <div className="nav-item-badge">
                      {lowStockCount}
                    </div>
                  )}
                  {disabled && (
                    <Badge size="xs" color="gray" variant="dot">
                      Bloqueado
                    </Badge>
                  )}
                </div>
              );
            })}
          </Stack>

          <Paper withBorder p="md" radius="lg" style={{ background: "linear-gradient(135deg, rgba(15, 23, 42, 0.08), rgba(99, 102, 241, 0.12))" }}>
            <Stack gap="xs">
              <Group gap="xs">
                <ThemeIcon color="indigo" variant="light" size="md">
                  <TrendingUp size={18} />
                </ThemeIcon>
                <Text size="sm" fw={700} style={{ color: "#1f2937" }}>
                  Análisis en tiempo real
                </Text>
              </Group>
              <Text size="xs" c="dimmed" style={{ lineHeight: 1.5 }}>
                Consulta métricas clave del turno y controla alertas de stock en un solo lugar.
              </Text>
            </Stack>
          </Paper>

          {adminUnlocked ? (
            <Button variant="light" color="yellow" onClick={handleLockAdmin}>
              Cerrar sesión administrativa
            </Button>
          ) : (
            <Button
              variant="gradient"
              gradient={{ from: "indigo", to: "blue", deg: 90 }}
              onClick={() => {
                setPendingTab(activeTab);
                passwordModalHandlers.open();
              }}
              leftSection={<ShieldCheck size={16} />}
            >
              Desbloquear secciones
            </Button>
          )}
        </Stack>
      </AppShell.Navbar>

      <AppShell.Main>
        <Notifications position="top-right" />
        {!currentTab ? null : customerDisplay && activeTab === "pos" ? (
          <CustomerDisplay
            cart={cartDetailed}
            total={cartTotals.total}
            change={cartTotals.change}
            paymentLabel={paymentOption?.label ?? "Sin método"}
          />
        ) : (
          <Stack gap="xl">
            {activeTab === "dashboard" && (
              <DashboardView
                products={products}
                sales={sales}
                clients={clients}
                activeShift={activeShift}
                shiftSummary={shiftSummary}
                onEditSale={(saleId) => setPaymentEditSaleId(saleId)}
              />
            )}
            {activeTab === "pos" && (
              <Stack gap="xl">
                <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">
                  <Paper withBorder radius="lg" p="md" style={{ background: "linear-gradient(135deg, rgba(59,130,246,0.12), rgba(147,197,253,0.18))" }}>
                    <Stack gap={4}>
                      <Group justify="space-between">
                        <Group gap="xs">
                          <ThemeIcon variant="gradient" gradient={{ from: "blue", to: "cyan" }} radius="md">
                            <TrendingUp size={18} />
                          </ThemeIcon>
                          <Text size="sm" c="dimmed">
                            Ventas del turno
                          </Text>
                        </Group>
                        <Badge size="sm" color="blue" variant="light">
                          {activeShift ? "En curso" : "General"}
                        </Badge>
                      </Group>
                      <Text fw={700} fz="xl">
                        {formatCurrency(shiftSummary.total)}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {shiftSummary.tickets} tickets registrados ({formatCurrency(shiftSummary.byPayment.cash ?? 0)} en efectivo)
                      </Text>
                    </Stack>
                  </Paper>
                  <Paper withBorder radius="lg" p="md" style={{ background: "linear-gradient(135deg, rgba(16,185,129,0.12), rgba(45,212,191,0.18))" }}>
                    <Stack gap={4}>
                      <Group gap="xs">
                        <ThemeIcon variant="gradient" gradient={{ from: "teal", to: "green" }} radius="md">
                          <ShoppingCart size={18} />
                        </ThemeIcon>
                        <Text size="sm" c="dimmed">
                          Carrito actual
                        </Text>
                      </Group>
                      <Group justify="space-between" align="flex-end">
                        <Text fw={700} fz="xl">
                          {formatCurrency(cartTotals.total)}
                        </Text>
                        <Badge size="sm" color="teal" variant="light">
                          {cartTotals.items} productos
                        </Badge>
                      </Group>
                      <Text size="xs" c="dimmed">
                        Selecciona el método de pago y confirma para generar el ticket.
                      </Text>
                    </Stack>
                  </Paper>
                  <Paper withBorder radius="lg" p="md" style={{ background: "linear-gradient(135deg, rgba(251,191,36,0.14), rgba(251,146,60,0.18))" }}>
                    <Stack gap={4}>
                      <Group gap="xs">
                        <ThemeIcon variant="gradient" gradient={{ from: "orange", to: "yellow" }} radius="md">
                          <AlertTriangle size={18} />
                        </ThemeIcon>
                        <Text size="sm" c="dimmed">
                          Stock crítico
                        </Text>
                      </Group>
                      <Group justify="space-between" align="center">
                        <Text fw={700} fz="xl">
                          {lowStockProducts.length}
                        </Text>
                        <Badge color="orange" variant="light" size="sm">
                          {lowStockProducts.length > 0 ? "Atención urgente" : "Todo en orden"}
                        </Badge>
                      </Group>
                      <Text size="xs" c="dimmed">
                        Revisa inventario para reponer productos bajo el mínimo.
                      </Text>
                    </Stack>
                  </Paper>
                </SimpleGrid>
                <Grid gutter="xl">
                  <Grid.Col span={{ base: 12, xl: 7 }}>
                    <Stack gap="md">
                      <Card withBorder radius="lg" shadow="sm">
                        <Stack gap="md">
                          <Group justify="space-between" align="flex-start">
                            <div>
                              <Title order={3}>Punto de venta</Title>
                              <Text c="dimmed">Busca, filtra y agrega productos para generar una venta.</Text>
                            </div>
                            {lowStockProducts.length > 0 && (
                              <Badge color="orange" size="lg">
                                {lowStockProducts.length} productos con bajo stock
                              </Badge>
                            )}
                          </Group>
                          <TextInput
                            placeholder="Buscar por nombre, categoría o código de barras"
                            value={search}
                            onChange={(event) => setSearch(event.currentTarget.value)}
                            rightSectionWidth={120}
                            rightSection={
                              <Select
                                placeholder="Atajos"
                                data={autoCompleteData.map((name) => ({ value: name, label: name }))}
                                searchable
                                nothingFoundMessage="Sin coincidencias"
                                value={null}
                                onChange={(value) => {
                                  if (!value) return;
                                  setSearch(value);
                                  const product = products.find((item) => item.name === value);
                                  if (product) handleAddProductToCart(product.id);
                                }}
                              />
                            }
                          />
                          <ScrollArea h={isMobile ? 400 : 520}>
                            <SimpleGrid cols={{ base: 1, sm: 2, md: 3, lg: 4 }} spacing="md">
                              {filteredProducts.map((product) => {
                                const stockRatio = Math.min(
                                  100,
                                  Math.round((product.stock / Math.max(product.minStock || 1, 1)) * 100)
                                );
                                return (
                                  <Card
                                    key={product.id}
                                    withBorder
                                    shadow="sm"
                                    radius="lg"
                                    onClick={() => handleAddProductToCart(product.id)}
                                    style={{ cursor: "pointer" }}
                                  >
                                    <Stack gap="xs">
                                      <Group justify="space-between" align="flex-start">
                                        <Stack gap={4}>
                                          <Text fw={600}>{product.name}</Text>
                                          <Text size="sm" c="dimmed">
                                            {product.category}
                                          </Text>
                                        </Stack>
                                        <Badge color="indigo" variant="light">
                                          {formatCurrency(product.price)}
                                        </Badge>
                                      </Group>
                                      <Group justify="space-between">
                                        <Text size="sm" c="dimmed">
                                          Stock actual: {product.stock}
                                        </Text>
                                        <Text size="sm" c="dimmed">
                                          Mínimo: {product.minStock}
                                        </Text>
                                      </Group>
                                      <Progress
                                        value={stockRatio}
                                        color={stockRatio < 50 ? "orange" : "teal"}
                                        radius="xl"
                                      />
                                      <Group justify="space-between">
                                        <Text size="xs" c="dimmed">
                                          {product.barcode ? `SKU: ${product.barcode}` : "Sin código asignado"}
                                        </Text>
                                        {product.stock <= product.minStock ? (
                                          <Badge color="orange" variant="light" size="sm">
                                            Bajo stock
                                          </Badge>
                                        ) : (
                                          <Badge color="teal" variant="light" size="sm">
                                            Disponible
                                          </Badge>
                                        )}
                                      </Group>
                                    </Stack>
                                  </Card>
                                );
                              })}
                            </SimpleGrid>
                          </ScrollArea>
                        </Stack>
                      </Card>
                      <Card withBorder radius="lg">
                        <Stack gap="md">
                          <Group justify="space-between">
                            <Title order={4}>Recordatorios críticos</Title>
                            <ActionIcon variant="subtle" color="indigo" onClick={() => productQuery.refetch()}>
                              <RefreshCcw size={18} />
                            </ActionIcon>
                          </Group>
                          {lowStockProducts.length === 0 ? (
                            <Paper withBorder p="lg" radius="md">
                              <Text c="dimmed" ta="center">
                                Inventario bajo control. No hay alertas activas.
                              </Text>
                            </Paper>
                          ) : (
                            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                              {lowStockProducts.map((product) => (
                                <Paper key={product.id} withBorder p="md" radius="md">
                                  <Stack gap={4}>
                                    <Text fw={600}>{product.name}</Text>
                                    <Text size="sm" c="dimmed">
                                      Stock actual: {product.stock} / Mínimo: {product.minStock}
                                    </Text>
                                    <Badge color="orange" variant="light">
                                      Prioridad alta
                                    </Badge>
                                  </Stack>
                                </Paper>
                              ))}
                            </SimpleGrid>
                          )}
                        </Stack>
                      </Card>
                    </Stack>
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, xl: 5 }}>
                    <Stack gap="md">
                      <Card withBorder radius="lg" shadow="sm">
                        <Stack gap="md">
                          <Group justify="space-between">
                            <Title order={4}>Carrito de venta</Title>
                            <Group gap="xs">
                              <Tooltip label={customerDisplay ? "Cerrar vista cliente" : "Mostrar al cliente"}>
                                <ActionIcon
                                  variant="light"
                                  color="indigo"
                                  onClick={() => setCustomerDisplay((prev) => !prev)}
                                >
                                  <MonitorPlay size={18} />
                                </ActionIcon>
                              </Tooltip>
                              <Tooltip label="Vaciar carrito">
                                <ActionIcon
                                  variant="subtle"
                                  color="red"
                                  onClick={() => setCart([])}
                                  disabled={cart.length === 0}
                                >
                                  <RefreshCcw size={18} />
                                </ActionIcon>
                              </Tooltip>
                            </Group>
                          </Group>
                          {cartDetailed.length === 0 ? (
                            <Paper withBorder p="xl" radius="md">
                              <Text c="dimmed" ta="center">
                                Agrega productos para iniciar la venta.
                              </Text>
                            </Paper>
                          ) : (
                            <ScrollArea h={320}>
                              <Table highlightOnHover>
                                <Table.Thead>
                                  <Table.Tr>
                                    <Table.Th>Producto</Table.Th>
                                    <Table.Th>Precio</Table.Th>
                                    <Table.Th>Cantidad</Table.Th>
                                    <Table.Th>Subtotal</Table.Th>
                                    <Table.Th style={{ width: 120 }}>Acciones</Table.Th>
                                  </Table.Tr>
                                </Table.Thead>
                                <Table.Tbody>
                                  {cartDetailed.map((item) => (
                                    <Table.Tr key={item.product.id}>
                                      <Table.Td>
                                        <Stack gap={2}>
                                          <Text fw={600}>{item.product.name}</Text>
                                          <Text size="xs" c="dimmed">
                                            {item.product.barcode || "Sin código asignado"}
                                          </Text>
                                        </Stack>
                                      </Table.Td>
                                      <Table.Td>{formatCurrency(item.product.price)}</Table.Td>
                                      <Table.Td>
                                        <Group gap="xs">
                                          <ActionIcon
                                            size="sm"
                                            variant="light"
                                            onClick={() => handleUpdateCartQuantity(item.product.id, item.quantity - 1)}
                                          >
                                            <Text fw={700}>-</Text>
                                          </ActionIcon>
                                          <Text fw={600}>{item.quantity}</Text>
                                          <ActionIcon
                                            size="sm"
                                            variant="light"
                                            onClick={() => handleUpdateCartQuantity(item.product.id, item.quantity + 1)}
                                          >
                                            <Text fw={700}>+</Text>
                                          </ActionIcon>
                                        </Group>
                                      </Table.Td>
                                      <Table.Td>
                                        <Text fw={600}>{formatCurrency(item.subtotal)}</Text>
                                      </Table.Td>
                                      <Table.Td>
                                        <Button
                                          variant="light"
                                          color="red"
                                          size="xs"
                                          onClick={() => handleRemoveCartItem(item.product.id)}
                                        >
                                          Quitar
                                        </Button>
                                      </Table.Td>
                                    </Table.Tr>
                                  ))}
                                </Table.Tbody>
                              </Table>
                            </ScrollArea>
                          )}
                          <Divider />
                          <Stack gap="md">
                            <Stack gap="xs">
                              <Text fw={600} size="sm">Método de pago</Text>
                              <Group gap="xs">
                                {PAYMENT_OPTIONS.map((option) => (
                                  <Button
                                    key={option.id}
                                    variant={selectedPayment === option.id ? "filled" : "light"}
                                    color={option.accent}
                                    size="sm"
                                    leftSection={<option.icon size={16} />}
                                    onClick={() => handleSelectPayment(option.id)}
                                    style={{
                                      flex: 1,
                                      minWidth: "fit-content",
                                      height: "2.5rem",
                                      fontWeight: selectedPayment === option.id ? 700 : 600
                                    }}
                                  >
                                    {option.label}
                                  </Button>
                                ))}
                              </Group>
                            </Stack>
                            {selectedPayment === "fiado" && (
                              <Select
                                label="Cliente autorizado"
                                placeholder="Selecciona un cliente"
                                data={clients
                                  .filter((client) => client.authorized)
                                  .map((client) => ({
                                    value: client.id,
                                    label: `${client.name} • ${formatCurrency(client.balance)}`
                                  }))}
                                value={selectedFiadoClient}
                                onChange={(value) => setSelectedFiadoClient(value)}
                              />
                            )}
                            {selectedPayment === "cash" && (
                              <NumberInput
                                label="Efectivo recibido"
                                placeholder="Monto entregado por el cliente"
                                thousandSeparator="."
                                decimalSeparator=","
                                value={cashReceived ?? undefined}
                                onChange={(value) => {
                                  if (value === "" || value === null) {
                                    setCashReceived(undefined);
                                    return;
                                  }
                                  const parsed = typeof value === "number" ? value : Number(value);
                                  setCashReceived(Number.isFinite(parsed) ? parsed : undefined);
                                }}
                                min={0}
                              />
                            )}
                            <Paper withBorder p="md" radius="md">
                              <Stack gap="xs">
                                <Group justify="space-between">
                                  <Text c="dimmed">Productos</Text>
                                  <Text fw={600}>{cartTotals.items}</Text>
                                </Group>
                                <Group justify="space-between">
                                  <Text>Total</Text>
                                  <Text fw={700}>{formatCurrency(cartTotals.total)}</Text>
                                </Group>
                                {selectedPayment === "cash" && typeof cashReceived === "number" && Number.isFinite(cashReceived) && (
                                  <Group justify="space-between">
                                    <Text>Cambio</Text>
                                    <Text fw={600} c={cartTotals.change >= 0 ? "teal" : "red"}>
                                      {formatCurrency(cartTotals.change)}
                                    </Text>
                                  </Group>
                                )}
                              </Stack>
                            </Paper>
                            <Group>
                              <Button
                                leftSection={<Receipt size={18} />}
                                onClick={handleCompleteSale}
                                disabled={cartDetailed.length === 0}
                                fullWidth
                              >
                                Cobrar y generar ticket
                              </Button>
                              <Button
                                variant="light"
                                color="violet"
                                onClick={() => returnDrawerHandlers.open()}
                                fullWidth
                              >
                                Gestionar devolución
                              </Button>
                            </Group>
                          </Stack>
                        </Stack>
                      </Card>
                    </Stack>
                  </Grid.Col>
                </Grid>
              </Stack>
            )}
            {activeTab === "inventory" && (
              <InventoryView
                products={products}
                search={inventorySearch}
                onSearchChange={setInventorySearch}
                categoryFilter={inventoryCategoryFilter}
                onCategoryFilterChange={setInventoryCategoryFilter}
                stockFilter={inventoryStockFilter}
                onStockFilterChange={setInventoryStockFilter}
                onRefresh={() => productQuery.refetch()}
                onNewProduct={() => {
                  setSelectedProductForEdit(null);
                  editProductModalHandlers.open();
                }}
                onAddStock={(productId) => {
                  setSelectedProductForStock(productId);
                  addStockModalHandlers.open();
                }}
                onEditProduct={(product) => {
                  setSelectedProductForEdit(product);
                  editProductModalHandlers.open();
                }}
              />
            )}
            {activeTab === "fiados" && (
              <FiadosView
                clients={clients}
                onAuthorize={handleAuthorizeFiado}
                onOpenModal={(clientId, mode) => {
                  setFiadoModalClientId(clientId);
                  setFiadoModalMode(mode);
                  fiadoModalHandlers.open();
                }}
                onOpenClientModal={() => clientModalHandlers.open()}
              />
            )}
            {activeTab === "reports" && (
              <ReportsView
                filters={reportFilters}
                onChangeFilters={setReportFilters}
                summary={reportSummary}
              />
            )}
            {activeTab === "shifts" && (
              <ShiftsView activeShift={activeShift} summary={shiftSummary} history={shiftHistory} />
            )}
          </Stack>
        )}
      </AppShell.Main>

      {isMobile && (
        <Paper
          radius="xl"
          shadow="lg"
          withBorder
          p="sm"
          style={{
            position: "fixed",
            bottom: 16,
            left: 16,
            right: 16,
            zIndex: 20
          }}
        >
          <Stack gap="sm">
            <Grid gutter="xs">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const disabled = tab.adminOnly && !adminUnlocked;
              return (
                <Grid.Col key={tab.id} span={12 / TABS.length}>
                  <Button
                    variant={activeTab === tab.id ? "light" : "subtle"}
                    fullWidth
                    onClick={() => guardTabChange(tab.id)}
                    leftSection={<Icon size={18} />}
                    style={{ opacity: disabled ? 0.6 : 1 }}
                  >
                    {tab.label}
                  </Button>
                </Grid.Col>
              );
            })}
            </Grid>
            {adminUnlocked ? (
              <Button size="sm" variant="light" color="yellow" onClick={handleLockAdmin}>
                Cerrar sesión administrativa
              </Button>
            ) : (
              <Button
                size="sm"
                variant="gradient"
                gradient={{ from: "indigo", to: "blue", deg: 90 }}
                onClick={() => {
                  setPendingTab(activeTab);
                  passwordModalHandlers.open();
                }}
                leftSection={<ShieldCheck size={16} />}
              >
                Desbloquear secciones
              </Button>
            )}
          </Stack>
        </Paper>
      )}

      <PasswordModal
        opened={passwordModalOpened}
        onClose={passwordModalHandlers.close}
        onUnlock={() => setAdminUnlocked(true)}
      />

      <ShiftModal
        opened={shiftModalOpened}
        mode={shiftModalMode}
        onClose={shiftModalHandlers.close}
        onOpenShift={handleOpenShift}
        onCloseShift={handleCloseShift}
        summary={{ ...shiftSummary, cashExpected: (activeShift?.initial_cash ?? 0) + (shiftSummary.byPayment.cash ?? 0) }}
      />

      <ClientModal
        opened={clientModalOpened}
        onClose={clientModalHandlers.close}
        onCreateClient={handleCreateClient}
      />

      <ReturnDrawer
        opened={returnDrawerOpened}
        onClose={returnDrawerHandlers.close}
        sales={sales.filter((sale) => sale.type === "sale")}
        value={returnSaleId}
        onSelectSale={setReturnSaleId}
        items={returnItems}
        onChangeItem={(itemId, quantity) =>
          setReturnItems((prev) => ({
            ...prev,
            [itemId]: Math.max(0, quantity)
          }))
        }
        reason={returnReason}
        onChangeReason={setReturnReason}
        refundMethod={returnRefundMethod}
        onChangeRefundMethod={setReturnRefundMethod}
        onConfirm={handleRegisterReturn}
      />

      <PaymentEditModal
        opened={Boolean(paymentEditSaleId)}
        sale={sales.find((sale) => sale.id === paymentEditSaleId) ?? null}
        onClose={() => setPaymentEditSaleId(null)}
        onSave={(method) => {
          if (!paymentEditSaleId) return;
          handleChangePaymentMethod(paymentEditSaleId, method);
        }}
      />

      <FiadoPaymentModal
        opened={fiadoModalOpened}
        client={clients.find((client) => client.id === fiadoModalClientId) ?? null}
        mode={fiadoModalMode}
        onClose={fiadoModalHandlers.close}
        onSubmit={({ amount, description }) => {
          if (!fiadoModalClientId) return;
          handleFiadoMovement({
            clientId: fiadoModalClientId,
            mode: fiadoModalMode,
            amount,
            description
          });
          fiadoModalHandlers.close();
        }}
      />

      <AddStockModal
        opened={addStockModalOpened}
        onClose={() => {
          addStockModalHandlers.close();
          setSelectedProductForStock(null);
        }}
        products={products}
        selectedProductId={selectedProductForStock}
        onConfirm={handleAddStock}
      />

      <EditProductModal
        opened={editProductModalOpened}
        onClose={() => {
          editProductModalHandlers.close();
          setSelectedProductForEdit(null);
        }}
        product={selectedProductForEdit}
        categories={Array.from(new Set(products.map((p) => p.category))).sort()}
        onSave={(productId, updates) => {
          if (productId) {
            handleEditProduct(productId, updates);
          } else {
            handleCreateProduct(updates as ProductInput);
          }
        }}
      />
    </AppShell>
  );
};

type ProductInput = {
  name: string;
  category: string;
  barcode: string | null;
  price: number;
  stock: number;
  minStock: number;
};

// ================== INVENTORY COMPONENTS ==================

interface InventoryViewProps {
  products: Product[];
  search: string;
  onSearchChange: (value: string) => void;
  categoryFilter: string | null;
  onCategoryFilterChange: (value: string | null) => void;
  stockFilter: "all" | "low" | "out";
  onStockFilterChange: (value: "all" | "low" | "out") => void;
  onRefresh: () => void;
  onNewProduct: () => void;
  onAddStock: (productId: string) => void;
  onEditProduct: (product: Product) => void;
}

const InventoryView = ({
  products,
  search,
  onSearchChange,
  categoryFilter,
  onCategoryFilterChange,
  stockFilter,
  onStockFilterChange,
  onRefresh,
  onNewProduct,
  onAddStock,
  onEditProduct
}: InventoryViewProps) => {
  const categories = useMemo(() => Array.from(new Set(products.map((p) => p.category))).sort(), [products]);

  const filteredProducts = useMemo(() => {
    let filtered = products;

    // Búsqueda
    if (search.trim()) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.name.toLowerCase().includes(searchLower) ||
          p.category.toLowerCase().includes(searchLower) ||
          p.barcode?.toLowerCase().includes(searchLower)
      );
    }

    // Filtro categoría
    if (categoryFilter) {
      filtered = filtered.filter((p) => p.category === categoryFilter);
    }

    // Filtro stock
    if (stockFilter === "low") {
      filtered = filtered.filter((p) => p.stock <= p.minStock && p.stock > 0);
    } else if (stockFilter === "out") {
      filtered = filtered.filter((p) => p.stock === 0);
    }

    return filtered;
  }, [products, search, categoryFilter, stockFilter]);

  const totalProducts = products.length;
  const totalValue = useMemo(() => products.reduce((acc, p) => acc + p.price * p.stock, 0), [products]);
  const lowStockCount = useMemo(() => products.filter((p) => p.stock <= p.minStock && p.stock > 0).length, [products]);
  const outStockCount = useMemo(() => products.filter((p) => p.stock === 0).length, [products]);

  return (
    <Stack gap="xl">
      {/* KPI Cards */}
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="lg">
        <Card
          withBorder
          radius="lg"
          style={{
            background: "linear-gradient(135deg, var(--mantine-color-teal-6), var(--mantine-color-teal-4))"
          }}
        >
          <Stack gap="xs">
            <Group justify="space-between">
              <Text size="sm" c="white" fw={500}>
                Total Productos
              </Text>
              <ThemeIcon color="white" variant="light" radius="xl">
                <Package size={20} />
              </ThemeIcon>
            </Group>
            <Title order={2} c="white">
              {totalProducts}
            </Title>
            <Text size="xs" c="white" opacity={0.9}>
              Productos registrados
            </Text>
          </Stack>
        </Card>

        <Card
          withBorder
          radius="lg"
          style={{
            background: "linear-gradient(135deg, var(--mantine-color-indigo-6), var(--mantine-color-indigo-4))"
          }}
        >
          <Stack gap="xs">
            <Group justify="space-between">
              <Text size="sm" c="white" fw={500}>
                Valor Total
              </Text>
              <ThemeIcon color="white" variant="light" radius="xl">
                <Coins size={20} />
              </ThemeIcon>
            </Group>
            <Title order={2} c="white">
              {formatCurrency(totalValue)}
            </Title>
            <Text size="xs" c="white" opacity={0.9}>
              Inventario valorizado
            </Text>
          </Stack>
        </Card>

        <Card
          withBorder
          radius="lg"
          style={{
            background: "linear-gradient(135deg, var(--mantine-color-orange-6), var(--mantine-color-orange-4))"
          }}
        >
          <Stack gap="xs">
            <Group justify="space-between">
              <Text size="sm" c="white" fw={500}>
                Stock Bajo
              </Text>
              <ThemeIcon color="white" variant="light" radius="xl">
                <AlertTriangle size={20} />
              </ThemeIcon>
            </Group>
            <Title order={2} c="white">
              {lowStockCount}
            </Title>
            <Text size="xs" c="white" opacity={0.9}>
              Productos con stock bajo
            </Text>
          </Stack>
        </Card>

        <Card
          withBorder
          radius="lg"
          style={{
            background: "linear-gradient(135deg, var(--mantine-color-red-6), var(--mantine-color-red-4))"
          }}
        >
          <Stack gap="xs">
            <Group justify="space-between">
              <Text size="sm" c="white" fw={500}>
                Sin Stock
              </Text>
              <ThemeIcon color="white" variant="light" radius="xl">
                <X size={20} />
              </ThemeIcon>
            </Group>
            <Title order={2} c="white">
              {outStockCount}
            </Title>
            <Text size="xs" c="white" opacity={0.9}>
              Productos agotados
            </Text>
          </Stack>
        </Card>
      </SimpleGrid>

      {/* Toolbar */}
      <Card withBorder radius="lg">
        <Stack gap="md">
          <Group justify="space-between">
            <Title order={3}>Control de Inventario</Title>
            <Group gap="sm">
              <Button
                variant="gradient"
                gradient={{ from: "teal", to: "cyan", deg: 90 }}
                leftSection={<Plus size={18} />}
                onClick={onNewProduct}
              >
                Nuevo Producto
              </Button>
              <Button variant="light" color="indigo" leftSection={<RefreshCcw size={18} />} onClick={onRefresh}>
                Sincronizar
              </Button>
            </Group>
          </Group>

          <Grid gutter="md">
            <Grid.Col span={{ base: 12, sm: 6, md: 4 }}>
              <TextInput
                placeholder="Buscar por nombre, categoría o código..."
                leftSection={<Search size={18} />}
                value={search}
                onChange={(e) => onSearchChange(e.currentTarget.value)}
                rightSection={
                  search ? (
                    <ActionIcon variant="subtle" color="gray" onClick={() => onSearchChange("")}>
                      <X size={16} />
                    </ActionIcon>
                  ) : null
                }
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6, md: 4 }}>
              <Select
                placeholder="Todas las categorías"
                leftSection={<Filter size={18} />}
                data={categories}
                value={categoryFilter}
                onChange={onCategoryFilterChange}
                clearable
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6, md: 4 }}>
              <Select
                placeholder="Estado de stock"
                data={[
                  { value: "all", label: "Todos" },
                  { value: "low", label: "Stock bajo" },
                  { value: "out", label: "Sin stock" }
                ]}
                value={stockFilter}
                onChange={(value) => onStockFilterChange(value as "all" | "low" | "out")}
              />
            </Grid.Col>
          </Grid>
        </Stack>
      </Card>

      {/* Tabla de productos */}
      <Card withBorder radius="lg">
        <ScrollArea h={500}>
          <Table highlightOnHover striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Nombre</Table.Th>
                <Table.Th>Categoría</Table.Th>
                <Table.Th>Código</Table.Th>
                <Table.Th>Precio</Table.Th>
                <Table.Th>Stock Actual</Table.Th>
                <Table.Th>Stock Mínimo</Table.Th>
                <Table.Th>Estado</Table.Th>
                <Table.Th>Acciones</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filteredProducts.length === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={8}>
                    <Text ta="center" c="dimmed" py="xl">
                      No se encontraron productos
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ) : (
                filteredProducts.map((product) => {
                  let statusColor = "teal";
                  let statusLabel = "Normal";

                  if (product.stock === 0) {
                    statusColor = "red";
                    statusLabel = "Sin stock";
                  } else if (product.stock <= product.minStock) {
                    statusColor = "orange";
                    statusLabel = "Stock bajo";
                  }

                  return (
                    <Table.Tr key={product.id}>
                      <Table.Td>
                        <Text fw={500}>{product.name}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Badge variant="light" color="indigo">
                          {product.category}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" c="dimmed">
                          {product.barcode || "-"}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Text fw={600}>{formatCurrency(product.price)}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Text fw={600}>{product.stock}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Text c="dimmed">{product.minStock}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Badge color={statusColor} variant="light">
                          {statusLabel}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Group gap="xs">
                          <Tooltip label="Agregar stock">
                            <ActionIcon
                              variant="light"
                              color="teal"
                              onClick={() => onAddStock(product.id)}
                            >
                              <Plus size={16} />
                            </ActionIcon>
                          </Tooltip>
                          <Tooltip label="Editar producto">
                            <ActionIcon
                              variant="light"
                              color="indigo"
                              onClick={() => onEditProduct(product)}
                            >
                              <Edit size={16} />
                            </ActionIcon>
                          </Tooltip>
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  );
                })
              )}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      </Card>
    </Stack>
  );
};

interface DashboardViewProps {
  products: Product[];
  sales: Sale[];
  clients: Client[];
  activeShift: Shift | undefined;
  shiftSummary: ShiftSummary;
  onEditSale: (saleId: string) => void;
}

const DashboardView = ({
  products,
  sales,
  clients,
  activeShift,
  shiftSummary,
  onEditSale
}: DashboardViewProps) => {
  const shiftSales = useMemo(() => {
    if (!activeShift) return [] as Sale[];
    return sales
      .filter((sale) => sale.shiftId === activeShift.id)
      .sort((a, b) => dayjs(b.created_at).valueOf() - dayjs(a.created_at).valueOf());
  }, [sales, activeShift]);

  const salesOnly = useMemo(() => shiftSales.filter((sale) => sale.type === "sale"), [shiftSales]);
  const returns = useMemo(() => shiftSales.filter((sale) => sale.type === "return"), [shiftSales]);
  const returnsTotal = useMemo(() => returns.reduce((acc, sale) => acc + sale.total, 0), [returns]);
  const fiadoTotal = useMemo(
    () => salesOnly.filter((sale) => sale.paymentMethod === "fiado").reduce((acc, sale) => acc + sale.total, 0),
    [salesOnly]
  );
  const staffTotal = useMemo(
    () => salesOnly.filter((sale) => sale.paymentMethod === "staff").reduce((acc, sale) => acc + sale.total, 0),
    [salesOnly]
  );

  const paymentData = Object.entries(shiftSummary.byPayment)
    .filter(([, value]) => value > 0)
    .map(([method, value]) => {
      const option = PAYMENT_OPTIONS.find((opt) => opt.id === method)!;
      return {
        name: option.label,
        value,
        method: method as PaymentMethod,
        color: PAYMENT_COLORS[method as PaymentMethod]
      };
    });

  const topProducts = useMemo(() => {
    const productSales = new Map<string, { name: string; quantity: number; revenue: number }>();
    salesOnly.forEach((sale) => {
      sale.items.forEach((item) => {
        const existing = productSales.get(item.productId) || { name: item.name, quantity: 0, revenue: 0 };
        productSales.set(item.productId, {
          name: item.name,
          quantity: existing.quantity + item.quantity,
          revenue: existing.revenue + item.price * item.quantity
        });
      });
    });
    return Array.from(productSales.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);
  }, [salesOnly]);

  const lowStockSnapshot = products
    .filter((product) => product.stock <= product.minStock)
    .sort((a, b) => a.stock - b.stock)
    .slice(0, 5);

  const clientsWithDebt = clients
    .filter((client) => client.balance > 0)
    .sort((a, b) => b.balance - a.balance)
    .slice(0, 5);

  const latestOperations = shiftSales.slice(0, 8);

  if (!activeShift) {
    const lowStockProducts = products.filter((product) => product.stock <= product.minStock).slice(0, 6);
    return (
      <Stack gap="lg">
        <Card withBorder radius="lg">
          <Stack gap="sm">
            <Title order={3}>Panel ejecutivo</Title>
            <Text c="dimmed">
              Aún no se registra un turno activo. Abre un turno desde la parte superior para comenzar a monitorear las ventas en tiempo real.
            </Text>
          </Stack>
        </Card>
        {lowStockProducts.length > 0 && (
          <Card withBorder radius="lg">
            <Stack gap="md">
              <Group justify="space-between">
                <Group gap="xs">
                  <AlertTriangle size={18} />
                  <Text fw={700}>Productos críticos</Text>
                </Group>
                <Badge color="orange" variant="light">
                  {lowStockProducts.length}
                </Badge>
              </Group>
              <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="sm">
                {lowStockProducts.map((product) => (
                  <Paper key={product.id} withBorder p="sm" radius="md">
                    <Stack gap={4}>
                      <Text fw={600} size="sm">{product.name}</Text>
                      <Text size="xs" c="dimmed">
                        Stock {product.stock} / Mínimo {product.minStock}
                      </Text>
                    </Stack>
                  </Paper>
                ))}
              </SimpleGrid>
            </Stack>
          </Card>
        )}
      </Stack>
    );
  }

  return (
    <Stack gap="lg">
      {activeShift && (
        <Card withBorder radius="lg" style={{ background: "linear-gradient(135deg, rgba(59,130,246,0.12), rgba(99,102,241,0.18))" }}>
          <Group justify="space-between" align="flex-start">
            <Stack gap={4}>
              <Text fw={700} fz="lg">
                Turno activo • {activeShift.seller}
              </Text>
              <Text size="sm" c="dimmed">
                {activeShift.type === "dia" ? "Turno diurno" : "Turno nocturno"} • Apertura {formatDateTime(activeShift.start)}
              </Text>
            </Stack>
            <Badge color="blue" variant="light">
              {shiftSales.length} movimientos
            </Badge>
          </Group>
        </Card>
      )}

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md">
        <Paper withBorder radius="lg" p="md">
          <Stack gap={4}>
            <Text size="sm" c="dimmed">
              Total recaudado
            </Text>
            <Text fw={700} fz="xl">
              {formatCurrency(shiftSummary.total)}
            </Text>
            <Text size="xs" c="dimmed">
              Incluye devoluciones: {formatCurrency(returnsTotal)}
            </Text>
          </Stack>
        </Paper>
        <Paper withBorder radius="lg" p="md">
          <Stack gap={4}>
            <Text size="sm" c="dimmed">
              Tickets emitidos
            </Text>
            <Text fw={700} fz="xl">
              {salesOnly.length}
            </Text>
            <Text size="xs" c="dimmed">
              Devoluciones registradas: {returns.length}
            </Text>
          </Stack>
        </Paper>
        <Paper withBorder radius="lg" p="md">
          <Stack gap={4}>
            <Text size="sm" c="dimmed">
              Fiado del turno
            </Text>
            <Text fw={700} fz="xl">
              {formatCurrency(fiadoTotal)}
            </Text>
            <Text size="xs" c="dimmed">
              Controla los abonos desde la sección de fiados
            </Text>
          </Stack>
        </Paper>
        <Paper withBorder radius="lg" p="md">
          <Stack gap={4}>
            <Text size="sm" c="dimmed">
              Consumo interno
            </Text>
            <Text fw={700} fz="xl">
              {formatCurrency(staffTotal)}
            </Text>
            <Text size="xs" c="dimmed">
              Ventas registradas como consumo del personal
            </Text>
          </Stack>
        </Paper>
      </SimpleGrid>

      <Grid gutter="md">
        <Grid.Col span={{ base: 12, lg: 7 }}>
          <Card withBorder radius="lg">
            <Stack gap="md">
              <Group justify="space-between">
                <Text fw={700}>Movimientos del turno</Text>
                <Badge variant="light" color="indigo">
                  {latestOperations.length}
                </Badge>
              </Group>
              {latestOperations.length === 0 ? (
                <Text c="dimmed" ta="center">
                  Aún no hay ventas registradas en este turno.
                </Text>
              ) : (
                <ScrollArea h={260}>
                  <Table highlightOnHover>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Ticket</Table.Th>
                        <Table.Th>Hora</Table.Th>
                        <Table.Th>Tipo</Table.Th>
                        <Table.Th>Método</Table.Th>
                        <Table.Th>Total</Table.Th>
                        <Table.Th>Acciones</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {latestOperations.map((sale) => {
                        const payment = PAYMENT_OPTIONS.find((option) => option.id === sale.paymentMethod);
                        return (
                          <Table.Tr key={sale.id}>
                            <Table.Td>#{sale.ticket}</Table.Td>
                            <Table.Td>{formatTime(sale.created_at)}</Table.Td>
                            <Table.Td>
                              <Badge color={sale.type === "sale" ? "teal" : "red"} variant="light">
                                {sale.type === "sale" ? "Venta" : "Devolución"}
                              </Badge>
                            </Table.Td>
                            <Table.Td>{payment?.label ?? sale.paymentMethod.toUpperCase()}</Table.Td>
                            <Table.Td>{formatCurrency(sale.total)}</Table.Td>
                            <Table.Td>
                              {sale.type === "sale" && (
                                <Button
                                  variant="light"
                                  size="xs"
                                  onClick={() => onEditSale(sale.id)}
                                >
                                  Ajustar método
                                </Button>
                              )}
                            </Table.Td>
                          </Table.Tr>
                        );
                      })}
                    </Table.Tbody>
                  </Table>
                </ScrollArea>
              )}
            </Stack>
          </Card>
        </Grid.Col>
        <Grid.Col span={{ base: 12, lg: 5 }}>
          <Card withBorder radius="lg">
            <Stack gap="md">
              <Text fw={700}>Cobros por método</Text>
              {paymentData.length === 0 ? (
                <Text c="dimmed" ta="center">
                  Registra ventas para visualizar el detalle.
                </Text>
              ) : (
                <div style={{ width: "100%", height: 220 }}>
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={paymentData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={90} paddingAngle={4}>
                        {paymentData.map((entry) => (
                          <Cell key={entry.method} fill={entry.color} />
                        ))}
                      </Pie>
                      <ChartTooltip formatter={(value: number) => formatCurrency(value)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
              <Stack gap="xs">
                {paymentData.map((entry) => (
                  <Group key={entry.method} justify="space-between">
                    <Text size="sm">{entry.name}</Text>
                    <Text fw={600} size="sm">
                      {formatCurrency(entry.value)}
                    </Text>
                  </Group>
                ))}
              </Stack>
            </Stack>
          </Card>
        </Grid.Col>
      </Grid>

      <Grid gutter="md">
        <Grid.Col span={{ base: 12, md: 6 }}>
          <Card withBorder radius="lg">
            <Stack gap="md">
              <Group gap="xs">
                <TrendingUp size={18} />
                <Text fw={700}>Top productos del turno</Text>
              </Group>
              {topProducts.length === 0 ? (
                <Text c="dimmed" ta="center">
                  Sin ventas registradas.
                </Text>
              ) : (
                <Stack gap="sm">
                  {topProducts.map((item, index) => (
                    <Group key={item.name} justify="space-between">
                      <Group gap="xs">
                        <Badge color="indigo" variant="light">
                          {index + 1}
                        </Badge>
                        <div>
                          <Text fw={600}>{item.name}</Text>
                          <Text size="xs" c="dimmed">{item.quantity} unidades</Text>
                        </div>
                      </Group>
                      <Text fw={700}>{formatCurrency(item.revenue)}</Text>
                    </Group>
                  ))}
                </Stack>
              )}
            </Stack>
          </Card>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <Card withBorder radius="lg">
            <Stack gap="md">
              <Group gap="xs">
                <AlertTriangle size={18} />
                <Text fw={700}>Inventario a vigilar</Text>
              </Group>
              {lowStockSnapshot.length === 0 ? (
                <Text c="dimmed" ta="center">
                  Sin alertas de stock.
                </Text>
              ) : (
                <Stack gap="sm">
                  {lowStockSnapshot.map((product) => (
                    <Group key={product.id} justify="space-between">
                      <Text>{product.name}</Text>
                      <Badge color="orange" variant="light">
                        {product.stock} uds.
                      </Badge>
                    </Group>
                  ))}
                </Stack>
              )}
            </Stack>
          </Card>
        </Grid.Col>
      </Grid>

      <Card withBorder radius="lg">
        <Stack gap="md">
          <Group gap="xs">
            <PiggyBank size={18} />
            <Text fw={700}>Clientes con saldo pendiente</Text>
          </Group>
          {clientsWithDebt.length === 0 ? (
            <Text c="dimmed" ta="center">
              Sin deudas registradas.
            </Text>
          ) : (
            <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="sm">
              {clientsWithDebt.map((client) => (
                <Paper key={client.id} withBorder radius="md" p="sm">
                  <Stack gap={2}>
                    <Text fw={600} size="sm">{client.name}</Text>
                    <Text size="xs" c="dimmed">
                      Saldo: {formatCurrency(client.balance)}
                    </Text>
                  </Stack>
                </Paper>
              ))}
            </SimpleGrid>
          )}
        </Stack>
      </Card>
    </Stack>
  );
};

interface FiadosViewProps {
  clients: Client[];
  onAuthorize: (clientId: string, authorized: boolean) => void;
  onOpenModal: (clientId: string, mode: "abono" | "total") => void;
  onOpenClientModal: () => void;
}

const FiadosView = ({ clients, onAuthorize, onOpenModal, onOpenClientModal }: FiadosViewProps) => {
  const totalDebt = clients.reduce((acc, client) => acc + client.balance, 0);
  const authorizedCount = clients.filter((client) => client.authorized).length;
  const blockedCount = clients.length - authorizedCount;
  const topDebtors = clients
    .filter((client) => client.balance > 0)
    .sort((a, b) => b.balance - a.balance)
    .slice(0, 5);

  const movementTimeline =
    clients
      .flatMap((client) =>
        (client.history ?? []).map((item) => ({
          ...item,
          client: client.name
        }))
      )
      .sort((a, b) => dayjs(b.created_at).valueOf() - dayjs(a.created_at).valueOf());

  return (
    <Stack gap="xl">
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
        <Paper withBorder radius="lg" p="md" style={{ background: "linear-gradient(135deg, rgba(59,130,246,0.12), rgba(147,197,253,0.18))" }}>
          <Stack gap={4}>
            <Group gap="xs">
              <ThemeIcon color="indigo" variant="light">
                <UsersRound size={18} />
              </ThemeIcon>
              <Text size="sm" c="dimmed">
                Clientes autorizados
              </Text>
            </Group>
            <Text fw={700} fz="xl">{authorizedCount}</Text>
          </Stack>
        </Paper>
        <Paper withBorder radius="lg" p="md" style={{ background: "linear-gradient(135deg, rgba(248,113,113,0.12), rgba(251,191,36,0.18))" }}>
          <Stack gap={4}>
            <Group gap="xs">
              <ThemeIcon color="orange" variant="light">
                <AlertTriangle size={18} />
              </ThemeIcon>
              <Text size="sm" c="dimmed">
                Clientes bloqueados
              </Text>
            </Group>
            <Text fw={700} fz="xl">{blockedCount}</Text>
          </Stack>
        </Paper>
        <Paper withBorder radius="lg" p="md" style={{ background: "linear-gradient(135deg, rgba(16,185,129,0.12), rgba(45,212,191,0.18))" }}>
          <Stack gap={4}>
            <Group gap="xs">
              <ThemeIcon color="teal" variant="light">
                <PiggyBank size={18} />
              </ThemeIcon>
              <Text size="sm" c="dimmed">
                Deuda total
              </Text>
            </Group>
            <Text fw={700} fz="xl">{formatCurrency(totalDebt)}</Text>
          </Stack>
        </Paper>
      </SimpleGrid>

      <Card withBorder radius="lg">
        <Stack gap="md">
          <Group justify="space-between">
            <Title order={3}>Gestión de fiados</Title>
            <Group gap="sm">
              <Badge color="violet" variant="light">
                {authorizedCount} autorizados
              </Badge>
              <Button
                size="sm"
                leftSection={<UserPlus size={16} />}
                onClick={onOpenClientModal}
              >
                Nuevo cliente
              </Button>
            </Group>
          </Group>
          <ScrollArea h={460}>
            <Table highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Cliente</Table.Th>
                  <Table.Th>Estado</Table.Th>
                  <Table.Th>Límite</Table.Th>
                  <Table.Th>Saldo</Table.Th>
                  <Table.Th>Acciones</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {clients.map((client) => (
                  <Table.Tr key={client.id}>
                    <Table.Td>{client.name}</Table.Td>
                    <Table.Td>
                      <Badge color={client.authorized ? "teal" : "red"} variant="light">
                        {client.authorized ? "Autorizado" : "Bloqueado"}
                      </Badge>
                    </Table.Td>
                    <Table.Td>{formatCurrency(client.limit)}</Table.Td>
                    <Table.Td>
                      <Text fw={600} c={client.balance > 0 ? "red" : "teal"}>
                        {formatCurrency(client.balance)}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Group gap="xs">
                        <Button
                          size="xs"
                          variant="default"
                          onClick={() => onAuthorize(client.id, !client.authorized)}
                        >
                          {client.authorized ? "Bloquear" : "Autorizar"}
                        </Button>
                        <Button
                          size="xs"
                          variant="light"
                          leftSection={<Coins size={16} />}
                          onClick={() => onOpenModal(client.id, "abono")}
                          disabled={client.balance === 0}
                        >
                          Registrar abono
                        </Button>
                        <Button
                          size="xs"
                          variant="subtle"
                          leftSection={<PiggyBank size={16} />}
                          onClick={() => onOpenModal(client.id, "total")}
                          disabled={client.balance === 0}
                        >
                          Pago total
                        </Button>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        </Stack>
      </Card>

      <Grid gutter="md">
        <Grid.Col span={{ base: 12, md: 6 }}>
          <Card withBorder radius="lg">
            <Stack gap="md">
              <Group gap="xs">
                <TrendingUp size={18} />
                <Text fw={700}>Principales deudores</Text>
              </Group>
              {topDebtors.length === 0 ? (
                <Text c="dimmed" ta="center">
                  Todos los clientes están al día.
                </Text>
              ) : (
                <Stack gap="sm">
                  {topDebtors.map((client) => (
                    <Group key={client.id} justify="space-between">
                      <Text>{client.name}</Text>
                      <Text fw={600}>{formatCurrency(client.balance)}</Text>
                    </Group>
                  ))}
                </Stack>
              )}
            </Stack>
          </Card>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <Card withBorder radius="lg">
            <Stack gap="md">
              <Group gap="xs">
                <Receipt size={18} />
                <Text fw={700}>Historial de movimientos</Text>
              </Group>
              {movementTimeline.length === 0 ? (
                <Text c="dimmed" ta="center">
                  Aún no registras movimientos de fiado.
                </Text>
              ) : (
                <ScrollArea h={240}>
                  <Stack gap="sm">
                    {movementTimeline.map((movement) => (
                      <Paper key={movement.id} withBorder radius="md" p="sm">
                        <Stack gap={2}>
                          <Group justify="space-between">
                            <Text fw={600}>{movement.client}</Text>
                            <Text size="xs" c="dimmed">
                              {formatDateTime(movement.created_at)}
                            </Text>
                          </Group>
                          <Text size="sm">{movement.description}</Text>
                          <Text size="xs" c="dimmed">
                            Saldo: {formatCurrency(movement.balance_after)}
                          </Text>
                        </Stack>
                      </Paper>
                    ))}
                  </Stack>
                </ScrollArea>
              )}
            </Stack>
          </Card>
        </Grid.Col>
      </Grid>
    </Stack>
  );
};

interface ReportsViewProps {
  filters: ReportFilters;
  onChangeFilters: (filters: ReportFilters) => void;
  summary: {
    total: number;
    tickets: number;
    byPayment: Record<PaymentMethod, number>;
    topProducts: { id: string; name: string; total: number; quantity: number }[];
    bySeller: { seller: string; total: number; tickets: number }[];
  };
}

const ReportsView = ({ filters, onChangeFilters, summary }: ReportsViewProps) => {
  const paymentData = Object.entries(summary.byPayment).map(([key, value]) => ({
    name: key.toUpperCase(),
    value
  }));

  const paymentChartData = paymentData.filter((item) => item.value > 0);

  return (
    <Stack gap="xl">
      <Card withBorder radius="lg">
        <Stack gap="md">
          <Group justify="space-between">
            <Title order={3}>Reportes de ventas</Title>
            <Group>
              <Select
                label="Rango rápido"
                data={REPORT_RANGES}
                value={filters.range}
                onChange={(value) => onChangeFilters({ ...filters, range: (value as ReportFilters["range"]) ?? "today" })}
              />
              {filters.range === "custom" && (
                <Group align="flex-end">
                  <TextInput
                    label="Desde"
                    placeholder="YYYY-MM-DD"
                    value={filters.from ?? ""}
                    onChange={(event) => onChangeFilters({ ...filters, from: event.currentTarget.value })}
                  />
                  <TextInput
                    label="Hasta"
                    placeholder="YYYY-MM-DD"
                    value={filters.to ?? ""}
                    onChange={(event) => onChangeFilters({ ...filters, to: event.currentTarget.value })}
                  />
                </Group>
              )}
            </Group>
          </Group>
          <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">
            <Paper withBorder p="md" radius="md">
              <Stack gap={4}>
                <Text c="dimmed">Total vendido</Text>
                <Text fw={700} size="xl">
                  {formatCurrency(summary.total)}
                </Text>
                <Badge color="teal" variant="light">
                  {summary.tickets} tickets
                </Badge>
              </Stack>
            </Paper>
            <Paper withBorder p="md" radius="md">
              <Stack gap={4}>
                <Text c="dimmed">Ticket promedio</Text>
                <Text fw={700} size="xl">
                  {summary.tickets === 0 ? formatCurrency(0) : formatCurrency(summary.total / summary.tickets)}
                </Text>
                <Badge color="indigo" variant="light">
                  Indicador general
                </Badge>
              </Stack>
            </Paper>
            <Paper withBorder p="md" radius="md">
              <Stack gap={4}>
                <Text c="dimmed">Efectivo controlado</Text>
                <Text fw={700} size="xl">
                  {formatCurrency(summary.byPayment.cash)}
                </Text>
                <Badge color="orange" variant="light">
                  Caja física
                </Badge>
              </Stack>
            </Paper>
          </SimpleGrid>
          <Grid gutter="xl">
            <Grid.Col span={{ base: 12, md: 6 }}>
              <Card withBorder radius="md" h={360}>
                <Stack gap="md" h="100%">
                  <Text fw={600}>Ventas por método de pago</Text>
                  {paymentChartData.length === 0 ? (
                    <Paper withBorder p="lg" radius="md">
                      <Text c="dimmed" ta="center">
                        No hay datos suficientes.
                      </Text>
                    </Paper>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={paymentChartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={110}>
                          {paymentChartData.map((entry) => (
                            <Cell key={entry.name} fill={PAYMENT_COLORS[entry.name.toLowerCase() as PaymentMethod]} />
                          ))}
                        </Pie>
                        <ChartTooltip formatter={(value: number) => formatCurrency(value)} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </Stack>
              </Card>
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 6 }}>
              <Card withBorder radius="md" h={360}>
                <Stack gap="md" h="100%">
                  <Text fw={600}>Rendimiento por vendedor</Text>
                  {summary.bySeller.length === 0 ? (
                    <Paper withBorder p="lg" radius="md">
                      <Text c="dimmed" ta="center">
                        Aún no hay datos registrados.
                      </Text>
                    </Paper>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={summary.bySeller}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="seller" />
                        <YAxis tickFormatter={(value) => `${value / 1000}K`} />
                        <ChartTooltip formatter={(value: number) => formatCurrency(value)} />
                        <Bar dataKey="total" fill="#4263eb" radius={[8, 8, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </Stack>
              </Card>
            </Grid.Col>
          </Grid>
          <Card withBorder radius="md">
            <Stack gap="md">
              <Group justify="space-between">
                <Text fw={600}>Top 20 productos más vendidos</Text>
                <Badge color="indigo" variant="light">
                  Actualizado
                </Badge>
              </Group>
              <ScrollArea h={280}>
                <Table striped highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Producto</Table.Th>
                      <Table.Th>Cantidad</Table.Th>
                      <Table.Th>Total</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {summary.topProducts.map((product) => (
                      <Table.Tr key={product.id}>
                        <Table.Td>{product.name}</Table.Td>
                        <Table.Td>{product.quantity}</Table.Td>
                        <Table.Td>{formatCurrency(product.total)}</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </ScrollArea>
            </Stack>
          </Card>
        </Stack>
      </Card>
    </Stack>
  );
};

interface ShiftsViewProps {
  activeShift: Shift | undefined;
  summary: ShiftSummary;
  history: Shift[];
}

const ShiftsView = ({ activeShift, summary, history }: ShiftsViewProps) => {
  const closedCount = history.length;
  const totalSales = history.reduce((acc, shift) => acc + (shift.total_sales ?? 0), 0);
  const totalDifferences = history.reduce((acc, shift) => acc + (shift.difference ?? 0), 0);
  const averageSales = closedCount > 0 ? totalSales / closedCount : 0;

  return (
    <Stack gap="xl">
      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
        <Paper withBorder radius="lg" p="md">
          <Stack gap={4}>
            <Text size="sm" c="dimmed">
              Turnos cerrados
            </Text>
            <Text fw={700} fz="xl">
              {closedCount}
            </Text>
          </Stack>
        </Paper>
        <Paper withBorder radius="lg" p="md">
          <Stack gap={4}>
            <Text size="sm" c="dimmed">
              Ventas promedio
            </Text>
            <Text fw={700} fz="xl">
              {formatCurrency(averageSales)}
            </Text>
          </Stack>
        </Paper>
        <Paper withBorder radius="lg" p="md">
          <Stack gap={4}>
            <Text size="sm" c="dimmed">
              Diferencia acumulada
            </Text>
            <Text fw={700} fz="xl" c={totalDifferences === 0 ? "teal" : totalDifferences > 0 ? "green" : "orange"}>
              {formatCurrency(totalDifferences)}
            </Text>
          </Stack>
        </Paper>
      </SimpleGrid>

      <Card withBorder radius="lg">
        <Stack gap="md">
          <Title order={3}>Turno en curso</Title>
          {activeShift ? (
            <Paper withBorder p="md" radius="md" style={{ background: "linear-gradient(135deg, rgba(13,148,136,0.12), rgba(45,212,191,0.18))" }}>
              <Stack gap="sm">
                <Group justify="space-between">
                  <Text fw={600}>{activeShift.seller}</Text>
                  <Badge color="teal" variant="light">
                    Turno {activeShift.type === "dia" ? "día" : "noche"}
                  </Badge>
                </Group>
                <Text size="sm" c="dimmed">
                  Inicio: {formatDateTime(activeShift.start)}
                </Text>
                <Divider />
                <Group justify="space-between">
                  <Text>Total ventas</Text>
                  <Text fw={700}>{formatCurrency(summary.total)}</Text>
                </Group>
                <Group justify="space-between">
                  <Text>Tickets</Text>
                  <Text fw={700}>{summary.tickets}</Text>
                </Group>
                {Object.entries(summary.byPayment).map(([method, value]) => (
                  <Group key={method} justify="space-between">
                    <Text c="dimmed">{method.toUpperCase()}</Text>
                    <Text fw={600}>{formatCurrency(value)}</Text>
                  </Group>
                ))}
              </Stack>
            </Paper>
          ) : (
            <Paper withBorder p="lg" radius="md">
              <Text c="dimmed" ta="center">
                No hay turnos activos. Inicia uno desde el encabezado.
              </Text>
            </Paper>
          )}
        </Stack>
      </Card>

      <Card withBorder radius="lg">
        <Stack gap="md">
          <Group justify="space-between">
            <Title order={4}>Historial de turnos</Title>
            <Badge color="indigo" variant="light">
              {history.length} turnos
            </Badge>
          </Group>
          <ScrollArea h={420}>
            <Table highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Vendedor</Table.Th>
                  <Table.Th>Inicio</Table.Th>
                  <Table.Th>Cierre</Table.Th>
                  <Table.Th>Turno</Table.Th>
                  <Table.Th>Ventas</Table.Th>
                  <Table.Th>Efectivo</Table.Th>
                  <Table.Th>Diferencia</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {history.length === 0 ? (
                  <Table.Tr>
                    <Table.Td colSpan={7}>
                      <Text c="dimmed" ta="center">
                        Aún no se registran turnos cerrados.
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ) : (
                  history.map((shift) => (
                    <Table.Tr key={shift.id}>
                      <Table.Td>{shift.seller}</Table.Td>
                      <Table.Td>{formatDateTime(shift.start)}</Table.Td>
                      <Table.Td>{shift.end ? formatDateTime(shift.end) : "-"}</Table.Td>
                      <Table.Td>{shift.type === "dia" ? "Día" : "Noche"}</Table.Td>
                      <Table.Td>{formatCurrency(shift.total_sales ?? 0)}</Table.Td>
                      <Table.Td>{formatCurrency(shift.cash_expected ?? 0)}</Table.Td>
                      <Table.Td>
                        <Badge color={(shift.difference ?? 0) === 0 ? "teal" : (shift.difference ?? 0) > 0 ? "green" : "orange"}>
                          {formatCurrency(shift.difference ?? 0)}
                        </Badge>
                      </Table.Td>
                    </Table.Tr>
                  ))
                )}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        </Stack>
      </Card>
    </Stack>
  );
};

export default App;
