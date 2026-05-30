import { SmsLiveClient } from "./SmsLiveClient";

/**
 * SMS live/stub switch (P5-E03-S02). Server shell; the toggle is a client
 * island that reads and flips `sms.live_enabled` via the admin API.
 */
export default function SmsLivePage() {
  return (
    <main>
      <h1>SMS — Go Live</h1>
      <SmsLiveClient />
    </main>
  );
}
