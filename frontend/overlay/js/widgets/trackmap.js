import { state } from '../state.js';
import * as utils from '../utils.js';

/**
 * Future-Proof Track Map System (Sherminator V2)
 * Fetches 1:1 coordinates from the game's REST API and renders them.
 * No CSV or manual configuration required.
 */
export class TrackMap {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');
        this.currentTrack = null;
        this.points = []; // [{x, z}] from API
        this.bounds = { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
        this.isLoaded = false;
        
        // Settings
        this.mapPadding = 30; // Padding in pixels around the track
        
        // Extrapolation state
        this.carStates = new Map(); // SlotID -> { lastX, lastZ, vx, vz, lastUpdate, data }
        
        // Start animation loop
        this.animate();
    }

    setTrackData(points, trackName) {
        if (!points || !Array.isArray(points) || points.length === 0) return;
        
        this.currentTrack = trackName;
        this.points = points;
        
        // 1. Calculate Bounds from Point Cloud
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        points.forEach(p => {
            if (p.x < minX) minX = p.x;
            if (p.x > maxX) maxX = p.x;
            if (p.z < minZ) minZ = p.z;
            if (p.z > maxZ) maxZ = p.z;
        });
        
        this.bounds = { minX, maxX, minZ, maxZ };
        this.isLoaded = true;
        this.carStates.clear();
        
        console.log(`[TrackMap] Dynamic Bounds set for ${trackName}:`, this.bounds);
    }

    updateData(standings) {
        if (!this.isLoaded) return;
        
        standings.forEach(car => {
            const existing = this.carStates.get(car.SlotID);
            if (existing) {
                existing.data = car;
            } else {
                this.carStates.set(car.SlotID, {
                    lastX: car.worldX || 0,
                    lastZ: car.worldZ || 0,
                    vx: 0,
                    vz: 0,
                    lastUpdate: performance.now(),
                    data: car
                });
            }
        });
    }

    /**
     * High-frequency update (10Hz) for positions only.
     * Calculates velocity vectors for extrapolation.
     */
    updatePositions(positions) {
        if (!this.isLoaded) return;
        
        const now = performance.now();
        positions.forEach(p => {
            const state = this.carStates.get(p.id);
            if (state) {
                const dt = (now - state.lastUpdate) / 1000; // time in seconds
                if (dt > 0.01) { // Prevent division by zero or jittery micro-updates
                    state.vx = (p.x - state.lastX) / dt;
                    state.vz = (p.z - state.lastZ) / dt;
                }
                state.lastX = p.x;
                state.lastZ = p.z;
                state.lastUpdate = now;
            }
        });
    }

    worldToCanvas(x, z) {
        if (!this.isLoaded) return { x: 0, y: 0 };
        
        const { minX, maxX, minZ, maxZ } = this.bounds;
        const width = this.canvas.width;
        const height = this.canvas.height;
        const pad = this.mapPadding;
        
        // Total range
        const trackW = maxX - minX;
        const trackH = maxZ - minZ;
        if (trackW === 0 || trackH === 0) return { x: 0, y: 0 };

        const availableW = width - (pad * 2);
        const availableH = height - (pad * 2);
        
        // Aspect-ratio correction (Center and fit)
        const trackAspect = trackW / trackH;
        const canvasAspect = availableW / availableH;
        
        let drawW = availableW, drawH = availableH, offsetX = pad, offsetY = pad;
        
        if (trackAspect > canvasAspect) {
            drawH = availableW / trackAspect;
            offsetY = pad + (availableH - drawH) / 2;
        } else {
            drawW = availableH * trackAspect;
            offsetX = pad + (availableW - drawW) / 2;
        }

        // Normalize X, Z (Invert Z mapping as world Z+ is up, screen Y+ is down)
        const normX = (x - minX) / trackW;
        const normZ = (maxZ - z) / trackH;
        
        return {
            x: offsetX + normX * drawW,
            y: offsetY + normZ * drawH
        };
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        this.render();
    }

    render() {
        if (!this.ctx || !this.isLoaded || this.points.length === 0) return;

        // Optimization: Only render if container is visible
        const cont = this.canvas.parentElement;
        if (cont && cont.classList.contains('hidden')) return;

        const width = this.canvas.width = 400; 
        const height = this.canvas.height = 400;
        this.ctx.clearRect(0, 0, width, height);

        // 1. Draw Track Line (Future-Proofed)
        const isFCY = document.body.classList.contains('state-fcy');
        this.ctx.strokeStyle = isFCY ? "#ffff00" : "rgba(255, 255, 255, 0.8)";
        this.ctx.lineWidth = 5;
        this.ctx.lineCap = "round";
        this.ctx.lineJoin = "round";
        
        if (isFCY) {
            this.ctx.shadowBlur = 10;
            this.ctx.shadowColor = "#ffff00";
        }

        this.ctx.beginPath();
        let lastX = null, lastZ = null;
        
        this.points.forEach((p, idx) => {
            const pos = this.worldToCanvas(p.x, p.z);
            
            if (idx === 0) {
                this.ctx.moveTo(pos.x, pos.y);
            } else {
                // Gap Detection: If the jump is > 50 meters, it's likely a different track segment or pit lane
                const dist = Math.sqrt(Math.pow(p.x - lastX, 2) + Math.pow(p.z - lastZ, 2));
                if (dist > 50) {
                    this.ctx.moveTo(pos.x, pos.y);
                } else {
                    this.ctx.lineTo(pos.x, pos.y);
                }
            }
            lastX = p.x;
            lastZ = p.z;
        });
        
        // Only close path if the last point is very close to the first (circular track)
        const first = this.points[0];
        const last = this.points[this.points.length - 1];
        if (first && last) {
            const totalDist = Math.sqrt(Math.pow(first.x - last.x, 2) + Math.pow(first.z - last.z, 2));
            if (totalDist < 30) this.ctx.closePath();
        }
        
        this.ctx.stroke();
        
        this.ctx.shadowBlur = 0; // Reset shadow

        // 2. Draw Cars (TinyPedal Style Extrapolation)
        const now = performance.now();

        this.carStates.forEach((state, slotId) => {
            const car = state.data;
            if (!car) return;
            
            // Extrapolate Current Position
            let elapsed = (now - state.lastUpdate) / 1000; // in seconds
            
            // Cap extrapolation at 250ms to prevent runaway cars if server hangs
            if (elapsed > 0.25) elapsed = 0.25; 
            
            const extX = state.lastX + (state.vx * elapsed);
            const extZ = state.lastZ + (state.vz * elapsed);
            
            const pos = this.worldToCanvas(extX, extZ);
            let color = utils.getWecClassColor(car.Class);

            let dotColor = color || "#888";
            let strokeColor = "#fff";
            let lineWidth = 1.5;

            // --- PITLANE DIMMING ---
            if (car.IsInPits) {
                this.ctx.globalAlpha = 0.4;
            } else {
                this.ctx.globalAlpha = 1.0;
            }

            if (car.IsSuspect) {
                dotColor = "#ffff00";
                strokeColor = "#ff8800";
                lineWidth = 3;
            }

            this.ctx.beginPath();
            this.ctx.arc(pos.x, pos.y, 20, 0, Math.PI * 2); 
            this.ctx.fillStyle = dotColor;
            this.ctx.fill();
            this.ctx.lineWidth = lineWidth;
            this.ctx.strokeStyle = strokeColor;
            this.ctx.stroke();
            
            this.ctx.shadowBlur = 0; // Reset shadow

            // Labels
            this.ctx.fillStyle = "#fff";
            this.ctx.font = "bold 14px 'Inter', sans-serif";
            this.ctx.textAlign = "center";
            this.ctx.textBaseline = "middle";
            this.ctx.fillText(car.ClassPosition || car.Position, pos.x, pos.y);

            if (car.IsFocused) {
                 this.ctx.beginPath();
                 this.ctx.arc(pos.x, pos.y, 23, 0, Math.PI * 2);
                 this.ctx.strokeStyle = "#fff";
                 this.ctx.lineWidth = 3;
                 this.ctx.stroke();
            }
            
            // RESET ALPHA FOR NEXT VEHICLE
            this.ctx.globalAlpha = 1.0;
        });
    }
}

export const trackMap = new TrackMap('track-map-canvas');
export const wecTrackMap = new TrackMap('wec-track-map-canvas');
