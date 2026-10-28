interface DeviceSubscription {
  endpoint: string;
  expirationTime: number | null;
  toJSON(): PushSubscriptionJSON;
  unsubscribe(): Promise<boolean>;
}
interface Dependencies {
  permission(): string;
  getSubscription(): Promise<DeviceSubscription | null>;
  subscribe(): Promise<DeviceSubscription>;
  register(subscription: PushSubscriptionJSON): Promise<unknown>;
  remove(endpoint: string): Promise<unknown>;
  sendTest(subscription: PushSubscriptionJSON): Promise<unknown>;
  isDisabling(): boolean;
  setDisabling(value: boolean): void;
}
export class NotificationController {
  enabled = false;
  private deps: Dependencies;
  constructor(deps: Dependencies) { this.deps = deps; }
  private valid(subscription: DeviceSubscription | null): boolean {
    return !!subscription && (!subscription.expirationTime || subscription.expirationTime > Date.now());
  }
  async check() {
    this.enabled = false;
    if (this.deps.isDisabling()) { await this.disable(); return; }
    if (this.deps.permission() !== 'granted') return;
    const subscription = await this.deps.getSubscription();
    if (!subscription || !this.valid(subscription)) return;
    await this.deps.register(subscription.toJSON());
    this.enabled = true;
  }
  async enable() {
    this.enabled = false;
    if (this.deps.isDisabling()) await this.disable();
    if (this.deps.permission() !== 'granted') throw new Error('Allow notifications in your browser or device settings first.');
    let subscription = await this.deps.getSubscription();
    if (subscription && !this.valid(subscription)) {
      await this.deps.remove(subscription.endpoint);
      if (!await subscription.unsubscribe()) throw new Error('Could not replace the expired subscription. Please retry.');
      subscription = null;
    }
    subscription ??= await this.deps.subscribe();
    await this.deps.register(subscription.toJSON());
    this.enabled = true;
  }
  async disable() {
    this.enabled = false;
    this.deps.setDisabling(true);
    const subscription = await this.deps.getSubscription();
    if (subscription) {
      await this.deps.remove(subscription.endpoint);
      if (!await subscription.unsubscribe()) throw new Error('Could not unsubscribe this browser. Please retry Disable.');
    }
    this.deps.setDisabling(false);
  }
  async test() {
    this.enabled = false;
    const subscription = await this.deps.getSubscription();
    if (this.deps.permission() !== 'granted' || !subscription || !this.valid(subscription)) throw new Error('Enable notifications again before sending a test.');
    try { await this.deps.sendTest(subscription.toJSON()); }
    catch (error) {
      if (typeof error === 'object' && error !== null && 'status' in error && error.status === 410) {
        // The push service has expired this endpoint even if the browser has no
        // expirationTime. Persist cleanup intent so a failed unsubscribe retries.
        await this.disable();
      }
      throw error;
    }
    this.enabled = true;
  }
}
