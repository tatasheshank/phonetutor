import { formatIndianMobile } from "@ai-tutor/shared";
import { currentUser } from "../../../lib/auth";
import { coursePriceInr, freeTrialMinutes, hasPaid, razorpayConfigured, testPaymentsAllowed } from "../../../lib/payments";
import { liveMinutesUsed } from "../../../lib/usageStore";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await currentUser();
  return Response.json({
    user: user ? { id: user.id, name: user.name, phone: formatIndianMobile(user.phone), isTest: user.isTest } : null,
    paid: user ? await hasPaid(user.id) : false,
    priceInr: coursePriceInr(),
    payments: { razorpay: razorpayConfigured(), test: testPaymentsAllowed() },
    trial: user ? { minutes: freeTrialMinutes(), used: Math.round((await liveMinutesUsed(user.id)) * 10) / 10 } : null,
  });
}
