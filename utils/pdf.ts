import PDFDocument from "pdfkit";
import { Types } from "mongoose";
import Settings from "../models/settings";

type InvoiceItem = {
  productId: Types.ObjectId | string;
  name: string;
  quantity: number;
  price: number;
  total: number;
};

type InvoiceLike = {
  invoiceId: string;
  customerName: string;
  items: InvoiceItem[];
  totalAmount: number;
  cashierName: string;
  status: "pending" | "completed" | "cancelled";
  paymentStatus: "pending" | "paid" | "failed";
  paymentMethod: "cash" | "upi";
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;
  createdAt: Date | string;
};

export const streamInvoicePdf = async (res: any, invoice: InvoiceLike) => {
  const settings =
    (await Settings.findOne().lean().exec()) || ({} as any);

  const currency = settings?.currency || "₹";
  const taxRate = typeof settings?.taxRate === "number" ? settings.taxRate : 0;

  const doc = new PDFDocument({ size: "A4", margin: 40 });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename=Invoice-${invoice.invoiceId}.pdf`
  );
  doc.pipe(res);

  // ========== Header ==========
  const startY = 40;

  // Logo (base64 or url may fail; wrap in try)
  if (settings?.logo) {
    try {
      doc.image(settings.logo, 40, startY, { width: 70, height: 70 });
    } catch {
      // ignore logo load issue
    }
  } else {
    // Placeholder logo box
    doc
      .rect(40, startY, 70, 70)
      .stroke()
      .fontSize(8)
      .text("Logo", 65, startY + 30, { align: "center" });
  }

  doc
    .font("Helvetica-Bold")
    .fontSize(20)
    .text(settings?.businessName || "Business Name", 120, startY);

  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor("#333")
    .text(settings?.address || "", 120, startY + 26, { width: 280 })
    .text(
      `Phone: ${settings?.contact || "-"}`,
      120,
      startY + 45
    )
    .text(`Email: ${settings?.email || "-"}`, 120, startY + 60)
    .text(`Website: ${settings?.website || "-"}`, 120, startY + 75)
    .text(`GSTIN: ${settings?.gstin || "-"}`, 120, startY + 90);

  doc
    .font("Helvetica-Bold")
    .fontSize(18)
    .fillColor("#111")
    .text("INVOICE", 420, startY, { align: "right" });

  doc
    .moveTo(40, 130)
    .lineTo(555, 130)
    .strokeColor("#cccccc")
    .stroke();

  // ========== Invoice Meta ==========
  const metaTop = 145;
  doc
    .font("Helvetica")
    .fontSize(11)
    .fillColor("#111")
    .text(`Invoice ID: ${invoice.invoiceId}`, 40, metaTop)
    .text(
      `Date: ${new Date(invoice.createdAt).toLocaleDateString()}`,
      40,
      metaTop + 18
    );

  doc
    .text(`Cashier: ${invoice.cashierName}`, 300, metaTop)
    .text(`Payment Method: ${invoice.paymentMethod.toUpperCase()}`, 300, metaTop + 18)
    .text(`Payment Status: ${invoice.paymentStatus.toUpperCase()}`, 300, metaTop + 36);

  // ========== Bill To & Cashier Boxes ==========
  doc
    .roundedRect(40, metaTop + 60, 260, 60, 6)
    .strokeColor("#e5e7eb")
    .stroke();
  doc
    .font("Helvetica-Bold")
    .text("Bill To:", 50, metaTop + 68);
  doc
    .font("Helvetica")
    .text(invoice.customerName || "Walk-in Customer", 50, metaTop + 86, { width: 240 });

  doc
    .roundedRect(340, metaTop + 60, 215, 60, 6)
    .strokeColor("#e5e7eb")
    .stroke();
  doc.font("Helvetica-Bold").text("Cashier:", 350, metaTop + 68);
  doc.font("Helvetica").text(invoice.cashierName, 350, metaTop + 86);

  // ========== Items Table Header ==========
  const tableTop = metaTop + 140;
  doc
    .moveTo(40, tableTop)
    .lineTo(555, tableTop)
    .strokeColor("#cccccc")
    .stroke();

  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor("#111")
    .text("Item", 45, tableTop + 8)
    .text("Qty", 300, tableTop + 8, { width: 40, align: "right" })
    .text("Price", 360, tableTop + 8, { width: 80, align: "right" })
    .text("Total", 460, tableTop + 8, { width: 90, align: "right" });

  doc
    .moveTo(40, tableTop + 28)
    .lineTo(555, tableTop + 28)
    .strokeColor("#cccccc")
    .stroke();

  // ========== Items Rows ==========
  let y = tableTop + 40;
  doc.font("Helvetica").fontSize(10).fillColor("#111");

  invoice.items.forEach((item) => {
    const rowHeight = 18;
    doc
      .text(item.name, 45, y, { width: 240 })
      .text(String(item.quantity), 300, y, { width: 40, align: "right" })
      .text(`${currency}${item.price.toFixed(2)}`, 360, y, {
        width: 80,
        align: "right",
      })
      .text(`${currency}${item.total.toFixed(2)}`, 460, y, {
        width: 90,
        align: "right",
      });
    y += rowHeight;
    if (y > 680) {
      // New page
      doc.addPage();
      y = 60;
    }
  });

  doc
    .moveTo(40, y + 6)
    .lineTo(555, y + 6)
    .strokeColor("#e5e7eb")
    .stroke();

  // ========== Totals ==========
  const subtotal = invoice.items.reduce((sum, it) => sum + (it.total || 0), 0);
  const taxAmount = subtotal * (taxRate / 100);
  const totalsTop = y + 24;

  // Totals block aligned to right
  doc
    .font("Helvetica")
    .fontSize(11)
    .text("Subtotal:", 360, totalsTop, { width: 90, align: "right" })
    .text(`${currency}${subtotal.toFixed(2)}`, 460, totalsTop, {
      width: 90,
      align: "right",
    })
    .text(`Tax (${taxRate}%):`, 360, totalsTop + 18, {
      width: 90,
      align: "right",
    })
    .text(`${currency}${taxAmount.toFixed(2)}`, 460, totalsTop + 18, {
      width: 90,
      align: "right",
    });

  doc
    .font("Helvetica-Bold")
    .fontSize(12)
    .text("Grand Total:", 360, totalsTop + 40, { width: 90, align: "right" })
    .text(`${currency}${invoice.totalAmount.toFixed(2)}`, 460, totalsTop + 40, {
      width: 90,
      align: "right",
    });

  // ========== Payment Summary Box ==========
  const payBoxTop = totalsTop + 80;
  doc
    .roundedRect(40, payBoxTop, 515, 90, 8)
    .strokeColor("#e5e7eb")
    .lineWidth(1)
    .stroke();

  doc.font("Helvetica-Bold").fontSize(12).text("Payment Summary", 50, payBoxTop + 10);

  doc.font("Helvetica").fontSize(10);
  doc.text(`Method: ${invoice.paymentMethod.toUpperCase()}`, 50, payBoxTop + 35);
  doc.text(`Status: ${invoice.paymentStatus.toUpperCase()}`, 200, payBoxTop + 35);

  // Razorpay references (show when present)
  doc.text(`Razorpay Order ID: ${invoice.razorpayOrderId || "-"}`, 50, payBoxTop + 55, { width: 480 });
  doc.text(`Razorpay Payment ID: ${invoice.razorpayPaymentId || "-"}`, 50, payBoxTop + 70, { width: 480 });
  doc.text(`Razorpay Signature: ${invoice.razorpaySignature || "-"}`, 50, payBoxTop + 85, { width: 480 });

  // ========== Footer ==========
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor("#6b7280")
    .text(
      "Thank you for your business! Returns accepted within 7 days with valid invoice. Items must be unopened and in original condition. This is a computer-generated invoice.",
      40,
      770,
      { width: 515, align: "center" }
    );

  doc.end();
};
