/** Distinguish a deliberate country tap from orbiting or a two-finger zoom. */
export class GlobePointerGesture {
  private pointers = new Map<number, {x:number;y:number;distance:number}>();
  private multiple = false;

  get active() { return this.pointers.size > 0; }

  down(id:number,x:number,y:number) {
    if (!this.active) this.multiple = false;
    this.pointers.set(id,{x,y,distance:0});
    if (this.pointers.size > 1) this.multiple = true;
  }

  move(id:number,x:number,y:number) {
    const start = this.pointers.get(id);
    if (start) start.distance = Math.max(start.distance,Math.hypot(x-start.x,y-start.y));
  }

  up(id:number,x:number,y:number) {
    this.move(id,x,y);
    const start = this.pointers.get(id);
    const clicked = !!start && !this.multiple && this.pointers.size === 1 && start.distance <= 6;
    this.pointers.delete(id);
    if (!this.active) this.multiple = false;
    return clicked;
  }

  cancel(id:number) {
    this.pointers.delete(id);
    this.multiple = this.active;
  }
}
