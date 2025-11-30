import jsPDF from "jspdf";
import { Shift, Sale, StockChange, Expense } from "../types";
import { formatCurrency, formatDateTime } from "./format";

interface ShiftPDFData {
  shift: Shift;
  sales: Sale[];
  expenses: Expense[];
  stockChanges: StockChange[];
}

export const generateShiftPDF = (data: ShiftPDFData) => {
  const { shift, sales, expenses, stockChanges } = data;

  // Crear documento PDF
  const doc = new jsPDF();

  // Configuración de colores
  const primaryColor = { r: 59, g: 130, b: 246 }; // Azul
  const accentColor = { r: 16, g: 185, b: 129 }; // Verde
  const warningColor = { r: 251, g: 146, b: 60 }; // Naranja
  const textColor = { r: 31, g: 41, b: 55 }; // Gris oscuro
  const lightGray = { r: 243, g: 244, b: 246 };

  let yPosition = 20;
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;

  // ============================================
  // ENCABEZADO
  // ============================================
  doc.setFillColor(primaryColor.r, primaryColor.g, primaryColor.b);
  doc.rect(0, 0, pageWidth, 45, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(24);
  doc.setFont("helvetica", "bold");
  doc.text("Negocio Eliana Maipú", margin, 20);

  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  doc.text(`Reporte de Turno - ${shift.type === "dia" ? "Día" : "Noche"}`, margin, 32);

  yPosition = 55;

  // ============================================
  // INFORMACIÓN DEL TURNO
  // ============================================
  doc.setTextColor(textColor.r, textColor.g, textColor.b);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("Información del Turno", margin, yPosition);

  yPosition += 10;

  doc.setFillColor(lightGray.r, lightGray.g, lightGray.b);
  doc.roundedRect(margin, yPosition - 5, pageWidth - 2 * margin, 35, 3, 3, "F");

  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(textColor.r, textColor.g, textColor.b);

  const infoLines = [
    `Vendedor: ${shift.seller}`,
    `Inicio: ${formatDateTime(shift.start)}`,
    `Fin: ${shift.end ? formatDateTime(shift.end) : "En curso"}`,
    `Estado: ${shift.status === "open" ? "Abierto" : "Cerrado"}`
  ];

  infoLines.forEach((line, index) => {
    doc.text(line, margin + 5, yPosition + 5 + index * 7);
  });

  yPosition += 45;

  // ============================================
  // RESUMEN DE VENTAS
  // ============================================
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(accentColor.r, accentColor.g, accentColor.b);
  doc.text("Resumen de Ventas", margin, yPosition);

  yPosition += 10;

  const totalSales = shift.total_sales ?? 0;
  const totalTickets = shift.tickets ?? 0;
  const cashExpected = shift.cash_expected ?? 0;
  const cashCounted = shift.cash_counted ?? 0;

  doc.setFillColor(lightGray.r, lightGray.g, lightGray.b);
  doc.roundedRect(margin, yPosition - 5, pageWidth - 2 * margin, 50, 3, 3, "F");

  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(textColor.r, textColor.g, textColor.b);

  const salesLines = [
    `Total ventas: ${formatCurrency(totalSales)}`,
    `Tickets emitidos: ${totalTickets}`,
    `Efectivo esperado: ${formatCurrency(cashExpected)}`,
    `Efectivo contado: ${shift.cash_counted ? formatCurrency(cashCounted) : "Pendiente"}`,
  ];

  if (shift.difference !== null && shift.difference !== undefined) {
    const diffText = shift.difference >= 0
      ? `Diferencia: +${formatCurrency(Math.abs(shift.difference))} (Sobrante)`
      : `Diferencia: -${formatCurrency(Math.abs(shift.difference))} (Faltante)`;
    salesLines.push(diffText);
  }

  salesLines.forEach((line, index) => {
    doc.text(line, margin + 5, yPosition + 5 + index * 7);
  });

  yPosition += 60;

  // ============================================
  // DESGLOSE DE PAGOS
  // ============================================
  if (shift.payments_breakdown) {
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(textColor.r, textColor.g, textColor.b);
    doc.text("Desglose por Método de Pago", margin, yPosition);

    yPosition += 10;

    const payments = shift.payments_breakdown;
    const paymentLabels: Record<string, string> = {
      cash: "Efectivo",
      card: "Tarjeta",
      transfer: "Transferencia",
      fiado: "Fiado",
      staff: "Personal"
    };

    Object.entries(payments).forEach(([method, amount]) => {
      if (amount > 0) {
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.text(`• ${paymentLabels[method] || method}: ${formatCurrency(amount)}`, margin + 5, yPosition);
        yPosition += 6;
      }
    });

    yPosition += 5;
  }

  // ============================================
  // GASTOS DEL TURNO
  // ============================================
  if (expenses.length > 0) {
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(warningColor.r, warningColor.g, warningColor.b);
    doc.text("Gastos Registrados", margin, yPosition);

    yPosition += 10;

    const totalExpenses = expenses.reduce((sum, exp) => sum + exp.amount, 0);

    doc.setFillColor(254, 243, 199); // Amarillo claro
    doc.roundedRect(margin, yPosition - 5, pageWidth - 2 * margin, 10 + expenses.length * 7, 3, 3, "F");

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(textColor.r, textColor.g, textColor.b);
    doc.text(`Total gastos: ${formatCurrency(totalExpenses)}`, margin + 5, yPosition);

    yPosition += 8;

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");

    expenses.forEach((expense) => {
      const expenseText = `• ${expense.type}: ${formatCurrency(expense.amount)}${expense.description ? ` - ${expense.description}` : ""}`;
      doc.text(expenseText, margin + 5, yPosition);
      yPosition += 6;
    });

    yPosition += 10;
  }

  // Verificar si necesitamos nueva página
  if (yPosition > 240) {
    doc.addPage();
    yPosition = 20;
  }

  // ============================================
  // CAMBIOS DE STOCK
  // ============================================
  if (stockChanges.length > 0) {
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(accentColor.r, accentColor.g, accentColor.b);
    doc.text("Modificaciones de Inventario", margin, yPosition);

    yPosition += 10;

    doc.setFillColor(220, 252, 231); // Verde claro
    doc.roundedRect(margin, yPosition - 5, pageWidth - 2 * margin, 10 + stockChanges.length * 10, 3, 3, "F");

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(textColor.r, textColor.g, textColor.b);
    doc.text(`Total modificaciones: ${stockChanges.length}`, margin + 5, yPosition);

    yPosition += 8;

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");

    stockChanges.forEach((change) => {
      const changeText = `• ${change.product_name}`;
      const detailText = `  ${change.stock_before} → ${change.stock_after} unidades (+${change.quantity_added})`;
      const userText = `  Modificado por: ${change.user}`;

      doc.text(changeText, margin + 5, yPosition);
      yPosition += 5;
      doc.setTextColor(107, 114, 128); // Gris
      doc.text(detailText, margin + 5, yPosition);
      yPosition += 4;
      doc.text(userText, margin + 5, yPosition);
      doc.setTextColor(textColor.r, textColor.g, textColor.b);
      yPosition += 8;

      // Verificar si necesitamos nueva página
      if (yPosition > 270) {
        doc.addPage();
        yPosition = 20;
      }
    });

    yPosition += 5;
  }

  // ============================================
  // PIE DE PÁGINA
  // ============================================
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(156, 163, 175);
    doc.setFont("helvetica", "italic");
    doc.text(
      `Generado el ${new Date().toLocaleString("es-CL")} - Página ${i} de ${totalPages}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 10,
      { align: "center" }
    );
  }

  // ============================================
  // GUARDAR PDF
  // ============================================
  const fileName = `Turno_${shift.seller}_${shift.type}_${shift.start.split("T")[0]}.pdf`;
  doc.save(fileName);
};
