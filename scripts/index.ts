// src/pages/api/booking.ts
import axios from "axios";
import { Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { withPaymentInterceptor, decodeXPaymentResponse } from "x402-axios";
import dotenv from "dotenv";
import type { APIRoute } from "astro";

dotenv.config();

// Atlanta-specific configuration
const ATLANTA_CONFIG = {
  taxRate: 0.08, // Atlanta sales tax
  timezone: "America/New_York",
  minBookingHours: 2,
  allowedDistricts: ["Downtown", "Midtown", "Buckhead", "West End"]
};

export const post: APIRoute = async ({ request }) => {
  try {
    const privateKey = process.env.PRIVATE_KEY as Hex;
    if (!privateKey) {
      throw new Error("Server configuration error");
    }

    const account = privateKeyToAccount(privateKey);
    const requestData = await request.json();

    // Validate Atlanta address
    if (!ATLANTA_CONFIG.allowedDistricts.includes(requestData.district)) {
      return new Response(
        JSON.stringify({ error: "Service not available in this Atlanta district" }),
        { status: 400 }
      );
    }

    const api = withPaymentInterceptor(
      axios.create({
        baseURL: process.env.CALCOM_BASE_URL || "https://api.cal.com/v1",
      }),
      account,
      {
        currency: "USD",
        city: "Atlanta",
        taxRate: ATLANTA_CONFIG.taxRate
      }
    );

    // Set CORS headers for ATL5D.com domains
    const headers = {
      "Access-Control-Allow-Origin": "https://atl5d.com",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json"
    };

    const response = await api.post("/bookings", {
      eventTypeId: process.env.ATL_EVENT_TYPE_ID || "30min",
      start: requestData.startTime,
      end: requestData.endTime,
      responses: {
        name: requestData.attendeeName,
        email: requestData.attendeeEmail,
        location: requestData.location,
        district: requestData.district,
        city: "Atlanta"
      },
      metadata: {
        atlantaBooking: true,
        source: "ATL5D.com",
        paymentType: "x402"
      }
    });

    const paymentResponse = decodeXPaymentResponse(
      response.headers["x-payment-response"]
    );

    return new Response(
      JSON.stringify({
        booking: response.data,
        payment: paymentResponse,
        atlantaConfirmation: `Your Atlanta booking #${response.data.id} is confirmed`
      }),
      { headers, status: 200 }
    );

  } catch (error: any) {
    console.error("Atlanta booking error:", error);
    return new Response(
      JSON.stringify({
        error: error.message,
        details: error.response?.data,
        atlantaSupport: "support@atl5d.com"
      }),
      { status: error.response?.status || 500 }
    );
  }
};

// Handle OPTIONS for CORS preflight
export const options: APIRoute = () => {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "https://atl5d.com",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    }
  });
};
