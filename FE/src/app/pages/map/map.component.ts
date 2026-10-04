import { Component, DestroyRef, HostListener, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MapService } from '../../core/services/map.service';
import { MapData } from '../../dtos/MapData';

@Component({
  selector: 'app-map',
  templateUrl: './map.component.html',
  styleUrls: ['./map.component.css'],
  imports: [CommonModule],
})
export class MapComponent implements OnInit, OnDestroy {
  private readonly mapService = inject(MapService);
  private readonly destroyRef = inject(DestroyRef);
  position: MapData | null = null;

  ngOnInit(): void {
    this.mapService.initMap('boat-map');
    this.mapService.getMapDataStream()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(data => {
        this.position = data;
        this.mapService.setPositionFresh(data !== null);
        if (data) {
          this.mapService.updateBoatPosition(data.lat, data.lon, data.yaw);
          this.mapService.updateBuoys(data.marks);
        }
      });
  }

  ngOnDestroy(): void { this.mapService.destroyMap(); }

  @HostListener('window:resize')
  onResize(): void { this.mapService.invalidateMapSize(); }

  resetTrack(): void { this.mapService.resetTrack(); }
}
