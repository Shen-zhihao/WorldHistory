import { Vector3 } from 'three';

/** A camera orbit, rather than a straight line through the planet. */
export interface GlobeFlight {
  readonly from: Vector3;
  readonly to: Vector3;
  readonly direction: Vector3;
  readonly tangent: Vector3;
  readonly angle: number;
  readonly startRadius: number;
  readonly endRadius: number;
  readonly arcLift: number;
  readonly startTime: number;
  readonly duration: number;
}

function validPosition(position: Vector3): boolean {
  return position.toArray().every(Number.isFinite) && position.lengthSq() > 1e-12;
}

export function createGlobeFlight(from: Vector3, to: Vector3, now: number, reducedMotion = false): GlobeFlight {
  if (!validPosition(from) || !validPosition(to) || !Number.isFinite(now)) {
    throw new RangeError('Globe flights require finite, nonzero camera positions and a finite start time.');
  }
  const startRadius = from.length();
  const endRadius = to.length();
  const direction = from.clone().divideScalar(startRadius);
  const targetDirection = to.clone().divideScalar(endRadius);
  const dot = Math.max(-1, Math.min(1, direction.dot(targetDirection)));
  const angle = Math.acos(dot);
  const tangent = targetDirection.clone().addScaledVector(direction, -dot);

  if (tangent.lengthSq() < 1e-18) {
    // At antipodes there is no unique shortest route. Prefer an east/west
    // orbit instead of passing over a pole and abruptly flipping north-up.
    tangent.crossVectors(direction, Math.abs(direction.y) < 0.98 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0));
  }
  tangent.normalize();
  const unchanged = angle < 1e-7 && Math.abs(startRadius - endRadius) < 1e-7;
  const duration = reducedMotion || unchanged ? 0 : Math.max(900, Math.min(1600, 850 + angle / Math.PI * 750 + Math.abs(startRadius - endRadius) * 120));

  return {
    from: from.clone(), to: to.clone(), direction, tangent, angle,
    startRadius, endRadius,
    arcLift: Math.min(0.08, Math.min(startRadius, endRadius) * 0.025) * Math.pow(angle / Math.PI, 2),
    startTime: now, duration,
  };
}

export function sampleGlobeFlight(flight: GlobeFlight, now: number): { position: Vector3; done: boolean } {
  if (flight.duration === 0 || now >= flight.startTime + flight.duration) return { position: flight.to.clone(), done: true };
  if (!Number.isFinite(now) || now <= flight.startTime) return { position: flight.from.clone(), done: false };

  const progress = Math.max(0, Math.min(1, (now - flight.startTime) / flight.duration));
  // Quintic easing gives both endpoints zero velocity and acceleration.
  const eased = progress ** 3 * (progress * (progress * 6 - 15) + 10);
  const direction = flight.direction.clone().multiplyScalar(Math.cos(flight.angle * eased))
    .addScaledVector(flight.tangent, Math.sin(flight.angle * eased)).normalize();
  const radius = flight.startRadius + (flight.endRadius - flight.startRadius) * eased
    + flight.arcLift * Math.sin(Math.PI * eased) ** 2;
  return { position: direction.multiplyScalar(radius), done: false };
}
