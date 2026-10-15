export interface OfficeLike {
  id: number;
  name: string;
  address: string;
  city: string;
  country: string;
  timezone: string;
  active: boolean;
  latitude?: number | string | null;
  longitude?: number | string | null;
}

export interface OfficeDTO {
  id: number;
  name: string;
  address: string;
  city: string;
  country: string;
  timezone: string;
  active: boolean;
  latitude: number;
  longitude: number;
}

export interface CreateOfficeInput {
  name: string;
  address: string;
  city: string;
  country: string;
  timezone: string;
  latitude: number;
  longitude: number;
}

export interface UpdateOfficeInput {
  name?: string;
  address?: string;
  city?: string;
  country?: string;
  timezone?: string;
  active?: boolean;
  latitude?: number;
  longitude?: number;
}

export const mapOfficeToDTO = (office: OfficeLike): OfficeDTO => {
  return {
    id: office.id,
    name: office.name,
    address: office.address,
    city: office.city,
    country: office.country,
    timezone: office.timezone,
    active: office.active,
    latitude: Number(office.latitude) || 0,
    longitude: Number(office.longitude) || 0,
  };
};
