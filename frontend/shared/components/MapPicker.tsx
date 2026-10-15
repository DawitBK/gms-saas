'use client';

import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useResetOnChange } from '@shared/hooks/useResetOnChange';

// Fix for default marker icons in Leaflet with Webpack
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

interface MapPickerProps {
  latitude: number | undefined;
  longitude: number | undefined;
  onChange: (lat: number, lng: number) => void;
}

function LocationMarker({ position, setPosition }: { position: L.LatLng | null; setPosition: (p: L.LatLng) => void }) {
  useMapEvents({
    click(e) {
      setPosition(e.latlng);
    },
  });

  return position === null ? null : (
    <Marker position={position} />
  );
}

export default function MapPicker({ latitude, longitude, onChange }: MapPickerProps) {
  const [position, setPosition] = useState<L.LatLng | null>(
    latitude !== undefined && longitude !== undefined ? new L.LatLng(latitude, longitude) : null
  );

  // Sync position with props if they change externally
  // Follow externally-controlled coordinates. Adjusted during render so the
  // marker is already in the right place on the first paint after a change,
  // rather than jumping a frame later.
  useResetOnChange([latitude, longitude], () => {
    if (latitude !== undefined && longitude !== undefined) {
      if (!position || position.lat !== latitude || position.lng !== longitude) {
        setPosition(new L.LatLng(latitude, longitude));
      }
    }
  });

  // Default to a central point if no location is selected (e.g., Example City)
  const defaultCenter: [number, number] = [9.0128, 38.7500];

  const handleManualChange = (lat: string, lng: string) => {
    const nextLat = lat === '' ? undefined : parseFloat(lat);
    const nextLng = lng === '' ? undefined : parseFloat(lng);

    if (nextLat !== undefined && nextLng !== undefined && !isNaN(nextLat) && !isNaN(nextLng)) {
      const nextPos = new L.LatLng(nextLat, nextLng);
      setPosition(nextPos);
      onChange(nextLat, nextLng);
    } else if (nextLat === undefined || nextLng === undefined) {
      // Allow partial entry or clearing without breaking the marker state immediately
      // But we still notify parent of the raw values if possible
      onChange(nextLat as any, nextLng as any);
    }
  };

  const handleMapChange = (newPos: L.LatLng) => {
    setPosition(newPos);
    onChange(newPos.lat, newPos.lng);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
            Latitude
          </label>
          <input
            type="number"
            step="0.000001"
            value={latitude ?? ''}
            onChange={(e) => handleManualChange(e.target.value, String(longitude ?? ''))}
            placeholder="e.g. 9.0128"
            className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-500/50"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
            Longitude
          </label>
          <input
            type="number"
            step="0.000001"
            value={longitude ?? ''}
            onChange={(e) => handleManualChange(String(latitude ?? ''), e.target.value)}
            placeholder="e.g. 38.7500"
            className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-500/50"
          />
        </div>
      </div>

      <div className="h-[400px] w-full rounded-2xl overflow-hidden border border-slate-800 ring-1 ring-slate-800 shadow-2xl">
        <MapContainer 
          center={position ? [position.lat, position.lng] : defaultCenter} 
          zoom={position ? 15 : 12} 
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <LocationMarker position={position} setPosition={handleMapChange} />
        </MapContainer>
      </div>
      <p className="text-[11px] text-slate-500 italic">
        * Click anywhere on the map to set coordinates, or type them manually above.
      </p>
    </div>
  );
}
