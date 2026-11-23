/**
 * Test-only features: the fixed-OTP test account, OTPs printed to the server log instead of SMS,
 * and the "test payment" button.
 *
 * On in development. Off in production builds unless ALLOW_TEST_FEATURES=true, which is meant for
 * a private staging server only. Never set it on a site real learners use: anyone who reads the
 * server log could sign in as anyone, and the test payment unlocks the course for free.
 */
export function testFeaturesAllowed(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.ALLOW_TEST_FEATURES === "true";
}
