import "server-only";
import { maskPhone } from "@ai-tutor/shared";
import { testFeaturesAllowed } from "./env";

/**
 * Sends the OTP. In development there is no SMS: the code is printed in the web app's terminal.
 * TODO(M4): send through MSG91 (DLT-registered template, one per language) when SMS_PROVIDER=msg91.
 */
export async function sendOtpSms(phone: string, code: string): Promise<void> {
  if (testFeaturesAllowed()) {
    console.log(`\n[dev OTP] ${maskPhone(phone)} → ${code}  (test mode: no SMS sent)\n`);
    return;
  }
  throw new Error("No SMS provider configured. Set up MSG91 before production.");
}
