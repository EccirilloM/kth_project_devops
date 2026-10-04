import { DestroyRef, Injectable, inject } from '@angular/core';
import * as L from 'leaflet';
import 'leaflet-rotatedmarker';
import { Observable } from 'rxjs';
import { TelemetryService } from './telemetry.service';
import { MqttService } from './mqtt.service';
import { MapData } from '../../dtos/MapData';
import { Mark } from '../../dtos/mark/Mark';
import { MarkType } from '../../dtos/mark/MarkType';

type RotatingMarker = L.Marker & {setRotationAngle(angle: number): L.Marker};
type RotationOptions = L.MarkerOptions & {rotationAngle: number; rotationOrigin: string};

@Injectable({providedIn: 'root'})
export class MapService {
  private map: L.Map | null = null;
  private boatMarker: RotatingMarker | null = null;
  private trackLine: L.Polyline | null = null;
  private readonly buoyMarkers = new Map<MarkType, L.Marker>();
  private boatPath: L.LatLng[] = [];
  private positionFresh = false;
  private centered = false;
  private readonly boatIcon = L.icon({
    iconUrl: 'assets/markers/nav.png', iconSize: [24, 24], iconAnchor: [12, 12],
  });
  private readonly buoyIcon = L.icon({
    iconUrl: 'assets/markers/boa.png', iconSize: [30, 30], iconAnchor: [15, 27],
  });
  private readonly telemetry = inject(TelemetryService);
  private readonly mqtt = inject(MqttService);

  constructor() {
    const subscription = this.mqtt.role$.subscribe(role => {
      if (role) return;
      this.resetTrack();
      this.boatMarker?.remove();
      this.boatMarker = null;
      this.buoyMarkers.forEach(marker => marker.remove());
      this.buoyMarkers.clear();
      this.positionFresh = false;
      this.centered = false;
    });
    inject(DestroyRef).onDestroy(() => {
      subscription.unsubscribe();
      this.destroyMap();
    });
  }

  getMapDataStream(): Observable<MapData | null> { return this.telemetry.mapData$; }

  initMap(elementId: string): void {
    this.destroyMap();
    this.map = L.map(elementId, {center: [45.7605, 10.8091], zoom: 13});
    this.centered = false;
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      minZoom: 5, maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(this.map);
    this.trackLine = L.polyline(this.boatPath, {color: '#22d3ee', weight: 3}).addTo(this.map);
    this.boatMarker?.addTo(this.map);
    this.buoyMarkers.forEach(marker => marker.addTo(this.map!));
  }

  destroyMap(): void {
    if (!this.map) return;
    this.map.off();
    this.map.remove();
    this.map = null;
    this.trackLine = null;
  }

  setPositionFresh(fresh: boolean): void {
    this.positionFresh = fresh;
    this.boatMarker?.setOpacity(fresh ? 1 : 0.35);
    this.buoyMarkers.forEach(marker => marker.setOpacity(fresh ? 1 : 0.35));
  }

  updateBoatPosition(lat: number, lon: number, yaw: number): void {
    if (!this.map) return;
    const position = L.latLng(lat, lon);
    const previous = this.boatPath.at(-1);
    if (!previous || !previous.equals(position)) this.boatPath.push(position);
    if (this.boatPath.length > 10000) this.boatPath.shift();
    this.trackLine?.setLatLngs(this.boatPath);
    if (!this.boatMarker) {
      const options: RotationOptions = {
        icon: this.boatIcon, rotationAngle: yaw, rotationOrigin: 'center center',
        alt: 'Boat position', title: 'Boat position',
      };
      this.boatMarker = L.marker(position, options).addTo(this.map) as RotatingMarker;
    } else {
      this.boatMarker.setLatLng(position);
      this.boatMarker.setRotationAngle(yaw);
    }
    this.boatMarker.setOpacity(this.positionFresh ? 1 : 0.35);
    if (!this.centered) { this.map.setView(position, 15); this.centered = true; }
  }

  updateBuoys(marks: Mark[]): void {
    if (!this.map) return;
    const present = new Set(marks.map(mark => mark.type));
    for (const [type, marker] of this.buoyMarkers) {
      if (!present.has(type)) { marker.remove(); this.buoyMarkers.delete(type); }
    }
    for (const mark of marks) {
      const position: L.LatLngExpression = [mark.lat, mark.lon];
      const existing = this.buoyMarkers.get(mark.type);
      if (existing) existing.setLatLng(position);
      else this.buoyMarkers.set(mark.type, L.marker(position, {
        icon: this.buoyIcon, alt: 'Buoy', title: mark.type,
      }).addTo(this.map));
    }
  }

  resetTrack(): void { this.boatPath = []; this.trackLine?.setLatLngs([]); }
  invalidateMapSize(): void { this.map?.invalidateSize(); }
}
