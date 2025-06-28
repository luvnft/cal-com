// src/pages/api/booking.ts
import axios from "axios";
import { Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { withPaymentInterceptor, decodeXPaymentResponse } from "x402-axios";
import dotenv from "dotenv";
import type { APIRoute } from "astro";

dotenv.config();

// Atlanta booking configuration
const ATLANTA_BOOKING_OPTIONS = {
  durations: {
    '15min': {
      eventTypeIds: process.env.ATL_EVENT_TYPE_IDS?.split(',') || [],
      price: 25.00, // Base price for 15min
      taxRate: 0.08
    },
    '30min': {
      eventTypeIds: process.env.ATL_EVENT_TYPE_IDS?.split(',') || [],
      price: 45.00,
      taxRate: 0.08
    },
    '90min': {
      eventTypeIds: process.env.ATL_EVENT_TYPE_IDS?.split(',') || [],
      price: 120.00,
      taxRate: 0.08
    }
  },
  timezone: "America/New_York",
  allowedDistricts: ["Downtown", "Midtown", "Buckhead", "West End"]
};

export const post: APIRoute = async ({ request }) => {
  try {
    const privateKey = process.env.PRIVATE_KEY as Hex;
    if (!privateKey) throw new Error("Server configuration error");

    const account = privateKeyToAccount(privateKey);
    const requestData = await request.json();

    // Validate duration
    const duration = requestData.duration;
    if (!ATLANTA_BOOKING_OPTIONS.durations[duration]) {
      return new Response(
        JSON.stringify({ error: "Invalid booking duration. Choose 15min, 30min, or 90min" }),
        { status: 400 }
      );
    }

    // Validate Atlanta district
    if (!ATLANTA_BOOKING_OPTIONS.allowedDistricts.includes(requestData.district)) {
      return new Response(
        JSON.stringify({ 
          error: "Service unavailable in this district",
          availableDistricts: ATLANTA_BOOKING_OPTIONS.allowedDistricts 
        }),
        { status: 400 }
      );
    }

    // Select event type ID based on duration
    const durationConfig = ATLANTA_BOOKING_OPTIONS.durations[duration];
    const eventTypeId = durationConfig.eventTypeIds[
      Math.floor(Math.random() * durationConfig.eventTypeIds.length)
    ];

    const api = withPaymentInterceptor(
      axios.create({
        baseURL: process.env.CALCOM_BASE_URL || "https://api.cal.com/v1",
      }),
      account,
      {
        currency: "USD",
        amount: durationConfig.price,
        taxRate: durationConfig.taxRate,
        description: `ATL5D ${duration} Booking`
      }
    );

    const response = await api.post("/bookings", {
      eventTypeId,
      start: requestData.startTime,
      end: requestData.endTime,
      timeZone: ATLANTA_BOOKING_OPTIONS.timezone,
      responses: {
        name: requestData.attendeeName,
        email: requestData.attendeeEmail,
        phone: requestData.attendeePhone,
        location: requestData.location,
        district: requestData.district,
        duration: duration
      },
      metadata: {
        city: "Atlanta",
        bookingType: "ATL5D_Public",
        paymentMethod: "x402"
      }
    });

    const paymentResponse = decodeXPaymentResponse(
      response.headers["x-payment-response"]
    );

    return new Response(
      JSON.stringify({
        success: true,
        bookingId: response.data.id,
        duration: duration,
        amount: durationConfig.price,
        tax: durationConfig.price * durationConfig.taxRate,
        total: durationConfig.price * (1 + durationConfig.taxRate),
        paymentStatus: paymentResponse.status,
        confirmationNumber: `ATL5D-${response.data.id}`,
        nextSteps: "You'll receive an Atlanta-specific confirmation email shortly"
      }),
      { 
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json"
        },
        status: 200 
      }
    );

  } catch (error: any) {
    console.error("ATL5D Booking Error:", error);
    return new Response(
      JSON.stringify({
        error: "Failed to process Atlanta booking",
        details: error.response?.data?.message || error.message,
        supportContact: "hi@atl5d.com",
        supportPhone: "(404) 889-5545"
      }),
      { 
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json"
        },
        status: error.response?.status || 500 
      }
    );
  }
};

export const options: APIRoute = () => {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    }
  });
};
