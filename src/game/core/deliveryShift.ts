import type { DeliveryCfg } from './minigame';

export type ShiftPhase = 'intro' | 'prepare' | 'boarding' | 'road' | 'arrival' | 'handoff' | 'crashed' | 'done';
export type TrafficIncident = { kind: 'redlight' | 'collision'; fine: number; message: string };
export type ShiftParcel = { id: number; from: string; to: string; bay: number; loaded: boolean };
export type RoadCar = { lane: number; at: number; color: string };
export const TRAFFIC_FINE = 20;
export const ROUTE_LENGTH = 112;
export const STOP_LINE = 62;

/** Retained legacy model. Current gameplay mounts src/lib/streetDispatch/runtime.js through DeliveryGame. */
export class DeliveryShift {
  phase: ShiftPhase = 'intro';
  elapsed = 0; completed = 0; fine = 0; violations = 0; wrong = 0;
  lane = 0; laneTarget = 0; speed = 0; travel = 0; roadAge = 0;
  animation = 0; leg = 0; comfort = 100;
  lesson = false;
  parcels: ShiftParcel[] = []; traffic: RoadCar[] = [];
  message = ''; selected = 0; reason = '';
  readonly target: number; readonly limit: number; readonly pace: number; readonly pay: number;
  private sequence = 0; private crossed = false; private posted = false;
  private nextRoad = false;
  private lessonSeen = false;
  constructor(readonly cfg: DeliveryCfg, readonly key: string, private random: () => number,
    private events: { delivered?: (count: number) => void; ended?: (count: number, reason: string) => void; incident?: (event: TrafficIncident) => void } = {}) {
    this.target = Math.max(1, cfg.targetOrders ?? 5);
    this.limit = Math.max(15, cfg.timeLimit ?? 90);
    this.pace = Math.max(1, Math.min(2, (key.includes('fulltime') ? 110 : cfg.mode === 'parcel' ? 100 : 90) / this.limit));
    this.pay = cfg.payPerOrder ?? (cfg.mode === 'food' ? 8 : cfg.mode === 'parcel' ? 6 : 25);
  }
  get current() { return this.parcels[0]; }
  get green() { return this.roadAge >= 8; }
  get lightLeft() { return Math.max(0, (8 - this.roadAge) / this.pace); }
  get balance() { return this.completed * this.pay - this.fine; }
  get foodChoices() { const id = this.current?.id ?? 1; return [id + 1, id, id + 2]; }
  start() { if (this.phase !== 'intro') return; this.prepare(); }
  private prepare() {
    this.phase = 'prepare'; this.animation = 0; this.lane = this.laneTarget = 0; this.selected = 0;
    const count = this.cfg.mode === 'parcel' ? Math.min(3, this.target - this.completed) : 1;
    this.parcels = Array.from({ length: count }, (_, i) => {
      const id = ++this.sequence;
      const bay = (this.completed + i + Math.floor(this.random() * this.cfg.drops.length)) % this.cfg.drops.length;
      return { id, from: this.cfg.pickups[(id - 1) % this.cfg.pickups.length]?.name ?? '街角门店', to: this.cfg.drops[bay]?.name ?? '客户门口', bay, loaded: false };
    });
    this.message = this.cfg.mode === 'parcel' ? '看包裹上的地址，放进同名分区；装完这一批就出发。' : this.cfg.mode === 'food' ? '对照取餐单，拿走相同编号的餐袋。' : '乘客正在路边等你，开门接客后就出发。';
  }
  choose(id: number) { if (this.phase !== 'prepare' && this.phase !== 'arrival') return; this.selected = id; }
  sort(id: number, bay: number) {
    if (this.phase !== 'prepare' || this.cfg.mode !== 'parcel') return false;
    const parcel = this.parcels.find(p => p.id === id);
    if (!parcel || parcel.loaded) return false;
    if (parcel.bay !== bay) { this.wrong++; this.message = `地址不符：这件包裹应放入「${parcel.to}」。`; return false; }
    parcel.loaded = true; this.selected = 0;
    this.message = this.parcels.every(p => p.loaded) ? '这一批已装好，点击「出发派送」。' : '装对了！继续把剩下的包裹放进同名分区。';
    return true;
  }
  takeFood(id: number) {
    if (this.phase !== 'prepare' || this.cfg.mode !== 'food') return false;
    if (id !== this.current?.id) { this.wrong++; this.message = `拿错了，取餐单需要 #${this.current?.id.toString().padStart(3, '0')}。`; return false; }
    this.current.loaded = true; this.phase = 'boarding'; this.animation = 0; this.nextRoad = true;
    this.message = '核对成功，餐袋放进保温箱。'; return true;
  }
  depart() {
    if (this.phase !== 'prepare' || !this.current) return false;
    if (this.cfg.mode === 'food' || (this.cfg.mode === 'parcel' && !this.parcels.every(p => p.loaded))) return false;
    this.phase = 'boarding'; this.animation = 0; this.nextRoad = true;
    this.message = this.cfg.mode === 'rideshare' ? '开门接客 · 乘客上车中' : '包裹装车 · 出发派送'; return true;
  }
  private beginRoad() {
    this.phase = 'road'; this.animation = 0; this.leg++; this.travel = this.roadAge = this.speed = 0;
    this.lane = this.laneTarget = 0; this.crossed = false;
    // First trip teaches the light with a clear middle lane. Later trips introduce a visible slow vehicle.
    this.traffic = [{ lane: -1, at: 35, color: '#c78267' }, { lane: 1, at: 98, color: '#89a59f' }];
    if (this.leg > 1) this.traffic.push({ lane: 0, at: 77, color: '#d6ba76' });
    this.message = '车辆自动前进；左右换道避车，红灯前点停车。';
  }
  steer(direction: number) { if (this.phase === 'road') this.laneTarget = Math.max(-1, Math.min(1, this.laneTarget + direction)); }
  setLane(lane: number) { if (this.phase === 'road') this.laneTarget = Math.max(-1, Math.min(1, Math.round(lane))); }
  acknowledgeRoadLesson() { this.lesson = false; this.lessonSeen = true; }
  handoff(id: number) {
    if (this.phase !== 'arrival' || !this.current) return false;
    const parcelIndex = this.parcels.findIndex(p => p.id === id);
    const matches = id === this.current.id || (this.cfg.mode === 'parcel' && parcelIndex >= 0 && this.parcels[parcelIndex].bay === this.current.bay);
    if (!matches) { this.wrong++; this.message = `这里是「${this.current.to}」，请交付相同地址的包裹。`; return false; }
    if (parcelIndex > 0) [this.parcels[0], this.parcels[parcelIndex]] = [this.parcels[parcelIndex], this.parcels[0]];
    this.phase = 'handoff'; this.animation = 0; this.message = this.cfg.mode === 'rideshare' ? '乘客下车中，正在完成行程。' : '交接中，等待签收。'; return true;
  }
  private finishHandoff() {
    const deliveredBay = this.current?.bay;
    this.completed++; this.parcels.shift(); this.events.delivered?.(this.completed);
    if (this.completed >= this.target) { this.end('完成本班'); return; }
    if (this.cfg.mode === 'parcel' && this.parcels.length) {
      const sameAddress = this.parcels.findIndex(p => p.bay === deliveredBay);
      if (sameAddress >= 0) {
        [this.parcels[0], this.parcels[sameAddress]] = [this.parcels[sameAddress], this.parcels[0]];
        this.phase = 'arrival'; this.animation = 0; this.message = '还有同地址包裹，可以在这里直接交付。';
      } else { this.phase = 'boarding'; this.animation = 0; this.nextRoad = true; this.message = `签收成功，下一站「${this.current!.to}」。`; }
    } else this.prepare();
  }
  step(seconds: number, brake = false) {
    if (this.phase === 'intro' || this.phase === 'done') return;
    const dt = Math.max(0, Math.min(.1, seconds));
    if (this.lesson) return;
    if (this.phase === 'crashed') { this.animation += dt; if (this.animation >= 1.6) this.end('车辆碰撞，本班终止'); return; }
    this.elapsed = Math.min(this.limit, this.elapsed + dt);
    if (this.elapsed >= this.limit) { this.end('班次时间已到'); return; }
    if (this.phase === 'boarding' || this.phase === 'handoff') {
      this.animation = Math.min(1, this.animation + dt * this.pace / 1.1);
      if (this.animation >= 1) { if (this.phase === 'handoff') this.finishHandoff(); else if (this.nextRoad) this.beginRoad(); }
      return;
    }
    if (this.phase !== 'road') return;
    this.roadAge += dt * this.pace;
    const target = brake ? 0 : 14 * this.pace;
    this.speed += Math.sign(target - this.speed) * Math.min(Math.abs(target - this.speed), dt * 90 * this.pace * this.pace);
    this.lane += (this.laneTarget - this.lane) * Math.min(1, dt * 9);
    const before = this.travel; this.travel += this.speed * dt;
    for (const car of this.traffic) car.at += dt * this.pace * 1.1;
    if (!this.crossed && before < STOP_LINE && this.travel >= STOP_LINE) {
      this.crossed = true;
      if (!this.green) {
        this.violations++; this.fine += TRAFFIC_FINE; this.comfort = Math.max(0, this.comfort - 12);
        this.events.incident?.({ kind: 'redlight', fine: TRAFFIC_FINE, message: `闯红灯，罚款 ¥${TRAFFIC_FINE}` });
        this.message = `闯红灯 −¥${TRAFFIC_FINE} · 下个路口请点停车。`;
      }
    }
    const collision = this.traffic.some(car => Math.abs(car.at - this.travel) < 2.8 && Math.abs(car.lane - this.lane) < .54);
    if (collision) {
      this.phase = 'crashed'; this.speed = 0; this.animation = 0; this.reason = '车辆碰撞，本班终止';
      this.message = this.reason; this.events.incident?.({ kind: 'collision', fine: 0, message: this.reason }); return;
    }
    if (this.travel >= ROUTE_LENGTH) { this.phase = 'arrival'; this.speed = 0; this.selected = 0; this.message = this.cfg.mode === 'rideshare' ? '已到目的地，开门让乘客下车。' : this.cfg.mode === 'parcel' ? `已到「${this.current!.to}」，选相同地址的包裹交付。` : '已到顾客门口，点击交付餐袋。'; }
    else if (!this.crossed && STOP_LINE - this.travel < 30) this.message = this.green ? '绿灯亮了，点击「继续出发」。' : brake && this.speed < 1 ? `已停稳，等绿灯 · ${Math.ceil(this.lightLeft)}秒` : '前方红灯！点「停车等灯」，绿灯后再点继续。';
    else if (this.traffic.some(car => car.at - this.travel > 2 && car.at - this.travel < 35 && Math.abs(car.lane - this.laneTarget) < .6)) this.message = '前方有慢车，点击左右换道避开。';
    if (this.leg === 1 && !this.lessonSeen && !this.green && this.travel > 34 && !brake) { this.lesson = true; this.message = '首次提示：点击下方「停车等灯」。此刻暂停计时，绿灯后再点继续。'; }
  }
  end(reason = '班次结束') { if (this.posted) return; this.posted = true; this.reason = reason; this.phase = 'done'; this.speed = 0; this.events.ended?.(this.completed, reason); }
  snapshot() { return { phase: this.phase, elapsed: this.elapsed, timeLeft: Math.max(0, this.limit - this.elapsed), completed: this.completed, fine: this.fine, violations: this.violations, balance: this.balance, lane: this.lane, laneTarget: this.laneTarget, speed: this.speed, travel: this.travel, roadAge: this.roadAge, green: this.green, lightLeft: this.lightLeft, animation: this.animation, leg: this.leg, comfort: this.comfort, parcels: this.parcels.map(p => ({ ...p })), traffic: this.traffic.map(c => ({ ...c })), selected: this.selected, message: this.message, reason: this.reason, wrong: this.wrong, lesson: this.lesson }; }
}
export type ShiftSnapshot = ReturnType<DeliveryShift['snapshot']>;
