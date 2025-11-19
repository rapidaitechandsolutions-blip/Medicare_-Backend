import Razorpay from 'razorpay';
import { ENV } from '../config/env';
import { logger } from './logger';
import crypto from 'crypto';

export const razorpay = new Razorpay({
  key_id: ENV.RAZORPAY_KEY_ID,
  key_secret: ENV.RAZORPAY_KEY_SECRET,
});

export const verifyPaymentSignature = (
  orderId: string,
  paymentId: string,
  signature: string
): boolean => {
  const generatedSignature = crypto
    .createHmac('sha256', ENV.RAZORPAY_KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
  return generatedSignature === signature;
};