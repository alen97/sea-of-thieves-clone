/**
 * EntityInterpolationSystem.js
 *
 * Handles smooth interpolation of networked entities using snapshot buffering.
 * Prevents jitter/lag by maintaining a small buffer of past states and
 * interpolating between them with a render delay.
 */

class EntityInterpolationSystem {
  /**
   * @param {number} bufferSize - Number of snapshots to keep (default: 3)
   * @param {number} renderDelay - Delay in ms for interpolation (default: 100ms)
   */
  constructor(bufferSize = 3, renderDelay = 100) {
    this.bufferSize = bufferSize;
    this.renderDelay = renderDelay;
    this.snapshots = []; // Circular buffer of snapshots
  }

  /**
   * Add a new snapshot to the buffer
   * @param {object} state - Entity state {x, y, rotation, timestamp}
   */
  addSnapshot(state) {
    const snapshot = {
      ...state,
      timestamp: state.timestamp || Date.now()
    };

    // Add to buffer
    this.snapshots.push(snapshot);

    // Keep buffer at max size
    if (this.snapshots.length > this.bufferSize) {
      this.snapshots.shift();
    }
  }

  /**
   * Get interpolated state for current time
   * @returns {object|null} Interpolated state {x, y, rotation} or null if insufficient data
   */
  getInterpolatedState() {
    if (this.snapshots.length < 2) {
      // Not enough snapshots to interpolate
      return this.snapshots.length === 1 ? this.snapshots[0] : null;
    }

    const renderTime = Date.now() - this.renderDelay;

    // Find the two snapshots to interpolate between
    let from = null;
    let to = null;

    for (let i = 0; i < this.snapshots.length - 1; i++) {
      if (this.snapshots[i].timestamp <= renderTime &&
          this.snapshots[i + 1].timestamp >= renderTime) {
        from = this.snapshots[i];
        to = this.snapshots[i + 1];
        break;
      }
    }

    // If we couldn't find a valid range, use the most recent snapshot
    if (!from || !to) {
      return this.snapshots[this.snapshots.length - 1];
    }

    // Calculate interpolation factor (0 to 1)
    const totalTime = to.timestamp - from.timestamp;
    const currentTime = renderTime - from.timestamp;
    const t = totalTime > 0 ? currentTime / totalTime : 1;

    // Interpolate position (linear)
    const x = this.lerp(from.x, to.x, t);
    const y = this.lerp(from.y, to.y, t);

    // Interpolate rotation (shortest path)
    const rotation = this.lerpAngle(from.rotation, to.rotation, t);

    return { x, y, rotation };
  }

  /**
   * Linear interpolation
   */
  lerp(start, end, t) {
    return start + (end - start) * t;
  }

  /**
   * Angular interpolation (handles wrapping around 0/2π)
   */
  lerpAngle(start, end, t) {
    // Normalize angles to [-π, π]
    const normalize = (angle) => {
      while (angle > Math.PI) angle -= Math.PI * 2;
      while (angle < -Math.PI) angle += Math.PI * 2;
      return angle;
    };

    start = normalize(start);
    end = normalize(end);

    // Calculate shortest path
    let diff = end - start;
    if (diff > Math.PI) diff -= Math.PI * 2;
    if (diff < -Math.PI) diff += Math.PI * 2;

    return normalize(start + diff * t);
  }

  /**
   * Clear all snapshots
   */
  clear() {
    this.snapshots = [];
  }

  /**
   * Check if system has enough data to interpolate
   */
  hasData() {
    return this.snapshots.length >= 2;
  }
}
