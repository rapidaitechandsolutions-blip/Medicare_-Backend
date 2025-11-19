import express, { Request, Response } from 'express';
import mongoose from 'mongoose';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import { Sale, ISale } from '../models/sale';
import { Product } from '../models/product';

const router = express.Router();

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

// Helper function to calculate start dates based on range
const getStartDates = (range: 'week' | 'month' | 'year') => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let startDate = new Date(today);

    switch (range) {
        case 'week':
            // Start of the last 7 days (including today)
            startDate.setDate(today.getDate() - 6); 
            break;
        case 'month':
            // Start of the last 30 days (approximately a month)
            startDate.setDate(today.getDate() - 29); 
            break;
        case 'year':
            // Start of the last 365 days (approximately a year)
            startDate.setDate(today.getDate() - 364); 
            break;
    }
    return startDate;
};

// GET /api/sales/analytics
// This new route fetches aggregated data for the dashboard and analytics view
router.get('/analytics', async (req: Request, res: Response) => {
    const { range = 'week' } = req.query as { range?: 'week' | 'month' | 'year' };
    const startDate = getStartDates(range);

    try {
        const pipeline: mongoose.PipelineStage[] = [
            // 1. Filter by status: only consider completed/paid sales for revenue metrics
            {
                $match: {
                    createdAt: { $gte: startDate },
                    paymentStatus: 'paid', // Only counting paid transactions
                },
            },
            // 2. Group for KPIs (Total Sales, Orders, AOV is calculated in frontend)
            {
                $group: {
                    _id: null,
                    totalRevenue: { $sum: '$totalAmount' },
                    totalOrders: { $sum: 1 },
                },
            },
        ];

        const kpis = await Sale.aggregate(pipeline);
        
        // Fetch all relevant sales for frontend aggregation of trend data
        const trendSales = await Sale.find({ createdAt: { $gte: startDate } }).lean();

        const result = {
            kpis: kpis[0] || { totalRevenue: 0, totalOrders: 0 },
            trendSales: trendSales, // Send raw sales data for flexible frontend charting (like breakdown by status/payment)
        };

        res.json(result);
    } catch (error) {
        console.error('Error fetching sales analytics:', error);
        res.status(500).json({ message: 'Server error fetching analytics' });
    }
});


// GET /api/sales
router.get('/', async (req: Request, res: Response) => {
  try {
    const sales = await Sale.find().lean();
    res.json(sales);
  } catch (error) {
    console.error('Error fetching sales:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/sales/:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const sale = await Sale.findById(req.params.id).lean();
    if (!sale) {
      return res.status(404).json({ message: 'Sale not found' });
    }
    res.json(sale);
  } catch (error) {
    console.error('Error fetching sale:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/sales
router.post('/', async (req: Request, res: Response) => {
  try {
    const { items, customerId, customerName, cashierId, cashierName } = req.body;

    // Validate items and update stock
    for (const item of items) {
      const product = await Product.findById(item.productId);
      if (!product) {
        return res.status(404).json({ message: `Product ${item.productId} not found` });
      }
      if (product.stock < item.quantity) {
        return res.status(400).json({ message: `Insufficient stock for ${product.name}` });
      }
      product.stock -= item.quantity;
      await product.save();
    }

    // Calculate total amount
    const totalAmount = items.reduce((sum: number, item: any) => sum + item.total, 0);

    // Create Razorpay order
    const order = await razorpay.orders.create({
      amount: totalAmount * 100,
      currency: 'INR',
      receipt: `receipt_${Date.now()}`,
    });

  const saleData = {
      invoiceId: `INV-${Date.now()}`,
      customerId: customerId ? new mongoose.Types.ObjectId(customerId) : null,
      customerName: customerName || 'Walk-in Customer',
      items: items.map((item: any) => ({
        productId: new mongoose.Types.ObjectId(item.productId),
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        total: item.total,
      })),
      totalAmount,
      cashierId: new mongoose.Types.ObjectId(cashierId),
      cashierName,
      status: 'pending',
      paymentStatus: 'pending',
      razorpayOrderId: order.id,
      razorpayPaymentId: undefined,
      razorpaySignature: undefined,
    };

    const sale = await Sale.create(saleData);
    res.status(201).json({ sale: sale.toObject(), razorpayKey: process.env.RAZORPAY_KEY_ID, razorpayOrderId: order.id });
  } catch (error) {
    console.error('Error creating sale:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/sales/verify-payment
router.post('/verify-payment', async (req: Request, res: Response) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    const body = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!)
      .update(body)
      .digest('hex');

    if (expectedSignature === razorpay_signature) {
      const sale = await Sale.findOneAndUpdate(
        { razorpayOrderId: razorpay_order_id },
        {
          razorpayPaymentId: razorpay_payment_id,
          razorpaySignature: razorpay_signature,
          paymentStatus: 'paid',
          status: 'completed',
        },
        { new: true }
      ).lean();
      if (!sale) {
        return res.status(404).json({ message: 'Sale not found' });
      }
      res.json({ sale });
    } else {
      res.status(400).json({ message: 'Invalid signature' });
    }
  } catch (error) {
    console.error('Error verifying payment:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;