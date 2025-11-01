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
  LayoutDashboard,
  LucideIcon,
  MonitorPlay,
  Moon,
  PiggyBank,
  Receipt,
  RefreshCcw,
  ShieldCheck,
  ShoppingCart,
  Sun,
  TrendingUp,
  UsersRound,
  Wallet,
  Waypoints
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
import { formatCurrency, formatDate, formatDateTime } from "./utils/format";

dayjs.extend(relativeTime);
dayjs.locale("es");

type TabId = "dashboard" | "pos" | "inventory" | "fiados" | "reports" | "shifts";

interface TabConfig {
  id: TabId;
  label: string;
  icon: LucideIcon;
}

const TABS: TabConfig[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "pos", label: "Punto de venta", icon: ShoppingCart },
  { id: "inventory", label: "Inventario", icon: BoxIcon },
  { id: "fiados", label: "Clientes fiados", icon: UsersRound },
  { id: "reports", label: "Reportes", icon: BarChart3 },
  { id: "shifts", label: "Turnos", icon: Clock3 }
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

interface ShiftModalProps {
  opened: boolean;
  mode: "open" | "close";
  onClose: () => void;
  onOpenShift: (payload: { seller: string; type: ShiftType }) => void;
  onCloseShift: (payload: { cashCounted: number }) => void;
  summary: ShiftSummary & { cashExpected: number };
}

const ShiftModal = ({ opened, mode, onClose, onOpenShift, onCloseShift, summary }: ShiftModalProps) => {
  const [seller, setSeller] = useState("");
  const [shiftType, setShiftType] = useState<ShiftType>("dia");
  const [cashCounted, setCashCounted] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (!opened) {
      setSeller("");
      setShiftType("dia");
      setCashCounted(undefined);
    }
  }, [opened]);

  const countedValue = typeof cashCounted === "number" && Number.isFinite(cashCounted) ? cashCounted : undefined;

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
                  onOpenShift({ seller: seller.trim(), type: shiftType });
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
                {Object.entries(summary.byPayment).map(([key, value]) => (
                  <Group key={key} justify="space-between">
                    <Text c="dimmed">{key.toUpperCase()}</Text>
                    <Text fw={600}>{formatCurrency(value)}</Text>
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

  const [paymentEditSaleId, setPaymentEditSaleId] = useState<string | null>(null);

  const [fiadoModalOpened, fiadoModalHandlers] = useDisclosure(false);
  const [fiadoModalClientId, setFiadoModalClientId] = useState<string | null>(null);
  const [fiadoModalMode, setFiadoModalMode] = useState<"abono" | "total">("abono");

  const [reportFilters, setReportFilters] = useState<ReportFilters>({ range: "today" });
  const [now, setNow] = useState(dayjs());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(dayjs()), 60000);
    return () => window.clearInterval(interval);
  }, []);

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

  const handleOpenShift = async ({ seller, type }: { seller: string; type: ShiftType }) => {
    const { error } = await supabase.from("elianamaipu_shifts").insert({
      seller,
      type,
      start_time: new Date().toISOString(),
      status: "open"
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
      message: `Turno ${type === "dia" ? "día" : "noche"} para ${seller}.`,
      color: "teal"
    });
    await queryClient.invalidateQueries({ queryKey: ["shifts"] });
    shiftModalHandlers.close();
  };

  const handleCloseShift = async ({ cashCounted }: { cashCounted: number }) => {
    if (!activeShift) return;
    const summary = computeShiftSummary(sales, activeShift.id);
    const cashExpected = summary.byPayment.cash ?? 0;
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
      payment_method: sale.paymentMethod,
      shift_id: sale.shiftId,
      seller: sale.seller,
      created_at: timestamp,
      items,
      notes: { reason: returnReason, originalTicket: sale.ticket }
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

    notifications.show({
      title: "Devolución registrada",
      message: `Se devolvieron ${formatCurrency(totalReturn)} al inventario.`,
      color: "teal"
    });

    setReturnItems({});
    setReturnSaleId(null);
    setReturnReason("");
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
        <Group justify="space-between" align="center" h="100%" px="lg">
          <Group gap="md">
            <ThemeIcon
              size={48}
              radius="xl"
              variant="gradient"
              gradient={{ from: "blue.4", to: "cyan.4", deg: 120 }}
            >
              <LayoutDashboard size={26} />
            </ThemeIcon>
            <Stack gap={4} style={{ color: "white" }}>
              <Text fw={700} fz={22}>
                Negocio Eliana Maipú
              </Text>
              <Text fz="sm" style={{ color: "rgba(255,255,255,0.7)" }}>
                Plataforma ejecutiva para control integral del negocio
              </Text>
            </Stack>
          </Group>
          <Group gap="md" align="center">
            <Stack gap={2} align="flex-end">
              <Group gap="xs">
                <ThemeIcon size={30} radius="md" variant="white" color="blue">
                  <Clock3 size={18} color="#1e3a8a" />
                </ThemeIcon>
                <Text fw={600} c="white" style={{ textTransform: "capitalize" }}>
                  {now.format("dddd, D [de] MMMM [de] YYYY")}
                </Text>
              </Group>
              <Text fz="sm" style={{ color: "rgba(255,255,255,0.7)", letterSpacing: "0.04em" }}>
                {now.format("HH:mm")} hrs
              </Text>
            </Stack>
            <Paper
              withBorder
              radius="lg"
              p="md"
              style={{
                background: "rgba(255, 255, 255, 0.16)",
                border: "1px solid rgba(255,255,255,0.3)",
                minWidth: 210
              }}
            >
              <Stack gap={6}>
                <Group justify="space-between" align="center">
                  <Text fw={600} c="white" fz="sm">
                    Estado del turno
                  </Text>
                  <Badge
                    size="sm"
                    radius="sm"
                    color={activeShift ? "teal" : "gray"}
                    variant="light"
                  >
                    {activeShift ? "Activo" : "Sin turno"}
                  </Badge>
                </Group>
                {activeShift ? (
                  <>
                    <Text fz="sm" c="white">
                      {activeShift.seller} • {activeShift.type === "dia" ? "Turno día" : "Turno noche"}
                    </Text>
                    <Text fz="xs" style={{ color: "rgba(255,255,255,0.75)" }}>
                      Inicio: {formatDateTime(activeShift.start)}
                    </Text>
                  </>
                ) : (
                  <Text fz="sm" style={{ color: "rgba(255,255,255,0.75)" }}>
                    Aún no se registra apertura de caja.
                  </Text>
                )}
              </Stack>
            </Paper>
            {activeShift ? (
              <Button
                size="sm"
                variant="gradient"
                gradient={{ from: "pink", to: "red", deg: 120 }}
                leftSection={<RefreshCcw size={16} />}
                onClick={() => {
                  setShiftModalMode("close");
                  shiftModalHandlers.open();
                }}
                style={{ fontWeight: 600 }}
              >
                Cerrar turno
              </Button>
            ) : (
              <Button
                size="sm"
                variant="gradient"
                gradient={{ from: "teal", to: "cyan", deg: 120 }}
                leftSection={<Clock3 size={16} />}
                onClick={() => {
                  setShiftModalMode("open");
                  shiftModalHandlers.open();
                }}
                style={{ fontWeight: 600 }}
              >
                Abrir turno
              </Button>
            )}
            <Tooltip
              label={colorScheme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
            >
              <ActionIcon
                variant="white"
                size="lg"
                radius="md"
                onClick={() => setColorScheme(colorScheme === "dark" ? "light" : "dark")}
                style={{ background: "rgba(255,255,255,0.22)" }}
              >
                {colorScheme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
              </ActionIcon>
            </Tooltip>
            <Tooltip label={customerDisplay ? "Cerrar vista cliente" : "Mostrar vista cliente"}>
              <ActionIcon
                variant="white"
                size="lg"
                radius="md"
                onClick={() => setCustomerDisplay((prev) => !prev)}
                style={{
                  background: customerDisplay ? "rgba(248,113,113,0.35)" : "rgba(255,255,255,0.22)"
                }}
              >
                <MonitorPlay size={18} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="md" className="sidebar-nav">
        <Stack gap="xs">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            const lowStockCount = tab.id === "inventory" ? products.filter((p) => p.stock <= p.minStock).length : 0;

            return (
              <div
                key={tab.id}
                className={`nav-item ${isActive ? "active" : ""}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <div className="nav-item-icon">
                  <Icon size={22} />
                </div>
                <Text style={{ flex: 1 }}>{tab.label}</Text>
                {lowStockCount > 0 && (
                  <div className="nav-item-badge">
                    {lowStockCount}
                  </div>
                )}
              </div>
            );
          })}
        </Stack>
        <Paper mt="auto" withBorder p="md" radius="lg" style={{ background: "linear-gradient(135deg, rgba(15, 23, 42, 0.08), rgba(99, 102, 241, 0.12))" }}>
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
              Visualiza tus ventas, inventario crítico y desempeño por turno sin interrupciones.
            </Text>
          </Stack>
        </Paper>
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
                            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
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
                      {activeShift && (
                        <Card withBorder radius="lg">
                          <Stack gap="xs">
                            <Group justify="space-between">
                              <Text fw={600}>Turno activo</Text>
                              <Badge color="teal" variant="light">
                                {activeShift.type === "dia" ? "Día" : "Noche"}
                              </Badge>
                            </Group>
                            <Text size="sm" c="dimmed">
                              {activeShift.seller} • desde {formatDateTime(activeShift.start)}
                            </Text>
                            <Divider />
                            <Stack gap="xs">
                              <Group justify="space-between">
                                <Text>Total ventas</Text>
                                <Text fw={700}>{formatCurrency(shiftSummary.total)}</Text>
                              </Group>
                              <Group justify="space-between">
                                <Text>Tickets</Text>
                                <Text fw={700}>{shiftSummary.tickets}</Text>
                              </Group>
                              {Object.entries(shiftSummary.byPayment).map(([key, value]) => (
                                <Group key={key} justify="space-between">
                                  <Text c="dimmed">{key.toUpperCase()}</Text>
                                  <Text fw={600}>{formatCurrency(value)}</Text>
                                </Group>
                              ))}
                            </Stack>
                          </Stack>
                        </Card>
                      )}
                    </Stack>
                  </Grid.Col>
                </Grid>
              </Stack>
            )}
            {activeTab === "inventory" && (
              <Stack gap="xl">
                <Card withBorder radius="lg">
                  <Stack gap="lg">
                    <Group justify="space-between">
                      <Title order={3}>Control de inventario</Title>
                      <Button leftSection={<BoxIcon size={18} />} onClick={() => productQuery.refetch()}>
                        Sincronizar con Supabase
                      </Button>
                    </Group>
                    <Grid gutter="xl">
                      <Grid.Col span={{ base: 12, md: 5 }}>
                        <ProductForm categories={Array.from(new Set(products.map((product) => product.category))).sort()} onSubmit={handleCreateProduct} />
                      </Grid.Col>
                      <Grid.Col span={{ base: 12, md: 7 }}>
                        <InventoryTable products={products} />
                      </Grid.Col>
                    </Grid>
                  </Stack>
                </Card>
              </Stack>
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
          <Grid gutter="xs">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <Grid.Col key={tab.id} span={12 / TABS.length}>
                  <Button
                    variant={activeTab === tab.id ? "light" : "subtle"}
                    fullWidth
                    onClick={() => setActiveTab(tab.id)}
                    leftSection={<Icon size={18} />}
                  >
                    {tab.label}
                  </Button>
                </Grid.Col>
              );
            })}
          </Grid>
        </Paper>
      )}

      <ShiftModal
        opened={shiftModalOpened}
        mode={shiftModalMode}
        onClose={shiftModalHandlers.close}
        onOpenShift={handleOpenShift}
        onCloseShift={handleCloseShift}
        summary={{ ...shiftSummary, cashExpected: shiftSummary.byPayment.cash ?? 0 }}
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

interface ProductFormProps {
  categories: string[];
  onSubmit: (product: ProductInput) => void;
}

const ProductForm = ({ categories, onSubmit }: ProductFormProps) => {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [barcode, setBarcode] = useState("");
  const [price, setPrice] = useState<number | undefined>(undefined);
  const [stock, setStock] = useState<number | undefined>(undefined);
  const [minStock, setMinStock] = useState<number | undefined>(5);

  const handleSubmit = () => {
    const trimmedName = name.trim();
    const trimmedCategory = category.trim();
    const priceValue = typeof price === "number" && Number.isFinite(price) ? price : undefined;

    if (!trimmedName || !trimmedCategory || priceValue === undefined || priceValue <= 0) {
      notifications.show({
        title: "Datos incompletos",
        message: "Nombre, categoría y precio son obligatorios.",
        color: "orange"
      });
      return;
    }
    onSubmit({
      name: trimmedName,
      category: trimmedCategory,
      barcode: barcode.trim() || null,
      price: priceValue,
      stock: (typeof stock === "number" && Number.isFinite(stock) ? stock : undefined) ?? 0,
      minStock: (typeof minStock === "number" && Number.isFinite(minStock) ? minStock : undefined) ?? 5
    });
    setName("");
    setCategory("");
    setBarcode("");
    setPrice(undefined);
    setStock(undefined);
    setMinStock(5);
  };

  return (
    <Stack gap="md">
      <Title order={4}>Registrar nuevo producto</Title>
      <TextInput
        label="Nombre"
        placeholder="Ej: Yogurt natural 1L"
        value={name}
        onChange={(event) => setName(event.currentTarget.value)}
      />
      <Autocomplete
        label="Categoría"
        placeholder="Selecciona o escribe"
        data={categories}
        value={category}
        onChange={setCategory}
      />
      <TextInput
        label="Código de barras"
        placeholder="Opcional"
        value={barcode}
        onChange={(event) => setBarcode(event.currentTarget.value)}
      />
      <NumberInput
        label="Precio"
        placeholder="CLP"
        thousandSeparator="."
        decimalSeparator=","
        value={price ?? undefined}
        min={0}
        onChange={(value) => {
          if (value === "" || value === null) {
            setPrice(undefined);
            return;
          }
          const parsed = typeof value === "number" ? value : Number(value);
          setPrice(Number.isFinite(parsed) ? parsed : undefined);
        }}
      />
      <NumberInput
        label="Stock inicial"
        value={stock ?? undefined}
        min={0}
        onChange={(value) => {
          if (value === "" || value === null) {
            setStock(undefined);
            return;
          }
          const parsed = typeof value === "number" ? value : Number(value);
          setStock(Number.isFinite(parsed) ? parsed : undefined);
        }}
      />
      <NumberInput
        label="Stock mínimo"
        value={minStock ?? undefined}
        min={0}
        onChange={(value) => {
          if (value === "" || value === null) {
            setMinStock(undefined);
            return;
          }
          const parsed = typeof value === "number" ? value : Number(value);
          setMinStock(Number.isFinite(parsed) ? parsed : undefined);
        }}
      />
      <Button leftSection={<BoxIcon size={18} />} onClick={handleSubmit}>
        Agregar producto
      </Button>
    </Stack>
  );
};

const InventoryTable = ({ products }: { products: Product[] }) => (
  <Card withBorder radius="lg">
    <Stack gap="md">
      <Title order={4}>Inventario completo</Title>
      <ScrollArea h={420}>
        <Table highlightOnHover striped>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Producto</Table.Th>
              <Table.Th>Categoría</Table.Th>
              <Table.Th>Stock</Table.Th>
              <Table.Th>Mínimo</Table.Th>
              <Table.Th>Cobertura</Table.Th>
              <Table.Th>Precio</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {products.map((product) => {
              const coverage = Math.min(
                100,
                Math.round((product.stock / Math.max(product.minStock || 1, 1)) * 100)
              );
              const statusColor = product.stock <= product.minStock ? "orange" : "teal";
              return (
                <Table.Tr key={product.id}>
                  <Table.Td>{product.name}</Table.Td>
                  <Table.Td>{product.category}</Table.Td>
                  <Table.Td>{product.stock}</Table.Td>
                  <Table.Td>{product.minStock}</Table.Td>
                  <Table.Td>
                    <Stack gap={4}>
                      <Progress value={coverage} color={statusColor} radius="xl" />
                      <Text size="xs" c="dimmed">
                        {coverage}% cobertura
                      </Text>
                    </Stack>
                  </Table.Td>
                  <Table.Td>{formatCurrency(product.price)}</Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </ScrollArea>
    </Stack>
  </Card>
);

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
    if (!activeShift) return [];
    return sales
      .filter((sale) => sale.shiftId === activeShift.id)
      .sort((a, b) => dayjs(b.created_at).valueOf() - dayjs(a.created_at).valueOf());
  }, [sales, activeShift]);

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

  const salesOnly = shiftSales.filter((sale) => sale.type === "sale");
  const returns = shiftSales.filter((sale) => sale.type === "return");
  const returnsTotal = returns.reduce((acc, sale) => acc + sale.total, 0);
  const fiadoTotal = salesOnly
    .filter((sale) => sale.paymentMethod === "fiado")
    .reduce((acc, sale) => acc + sale.total, 0);
  const staffTotal = salesOnly
    .filter((sale) => sale.paymentMethod === "staff")
    .reduce((acc, sale) => acc + sale.total, 0);

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

  return (
    <Stack gap="lg">
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
}

const FiadosView = ({ clients, onAuthorize, onOpenModal }: FiadosViewProps) => {
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
      .sort((a, b) => dayjs(b.timestamp).valueOf() - dayjs(a.timestamp).valueOf());

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
            <Badge color="violet" variant="light">
              {authorizedCount} autorizados
            </Badge>
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
                              {formatDateTime(movement.timestamp)}
                            </Text>
                          </Group>
                          <Text size="sm">{movement.description}</Text>
                          <Text size="xs" c="dimmed">
                            Saldo: {formatCurrency(movement.balance)}
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
