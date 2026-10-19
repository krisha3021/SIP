/** Per-instance daily request cap (IST calendar day), to keep a free-tier provider within its limits. */
export class DailyCounter {
  private day = '';
  private used = 0;
  constructor(private readonly cap: number) {}
  /** Returns true and counts the request if under the cap for the IST day containing `now`. */
  take(now: Date): boolean {
    const day = new Date(now.getTime() + 5.5 * 3_600_000).toISOString().slice(0, 10);
    if (day !== this.day) {
      this.day = day;
      this.used = 0;
    }
    if (this.used >= this.cap) return false;
    this.used++;
    return true;
  }
}
