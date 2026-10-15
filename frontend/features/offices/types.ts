export interface Office {
  id: number;
  name: string;
  address: string;
  city: string;
  country: string;
  timezone: string;
  active: boolean;
}

export interface CreateOfficePayload {
  name: string;
  address: string;
  city: string;
  country: string;
  timezone: string;
}
