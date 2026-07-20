import { Injectable, NgZone } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface RealtimeEvent {
  type: string;
  action?: string;
  patientId?: number;
  patientCode?: string;
  prescriptionId?: number;
  date?: string | null;
  timestamp?: string;
}

@Injectable({ providedIn: 'root' })
export class RealtimeService {
  constructor(private zone: NgZone) { }

  connect(): Observable<RealtimeEvent> {
    return new Observable<RealtimeEvent>(subscriber => {
      const eventSource = new EventSource(`${environment.apiUrl}/events`);

      eventSource.onmessage = (message) => {
        this.zone.run(() => {
          try {
            subscriber.next(JSON.parse(message.data));
          } catch (error) {
            console.error('Invalid realtime event', error);
          }
        });
      };

      eventSource.onerror = (error) => {
        this.zone.run(() => {
          console.error('Realtime connection error', error);
        });
      };

      return () => eventSource.close();
    });
  }
}
