import { z } from 'zod';

export const createOfficeSchema = z.object({
  body: z.object({
    name: z.string().min(2, 'Office name must be at least 2 characters long'),
    address: z.string().min(5, 'Address is too short'),
    city: z.string().min(2, 'City name is required'),
    country: z.string().min(2, 'Country is required'),
    timezone: z.string().min(1, 'Please select a valid timezone'),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  })
});

export const updateOfficeSchema = z.object({
  body: z.object({
    name: z.string().min(2).optional(),
    address: z.string().min(5).optional(),
    city: z.string().min(2).optional(),
    country: z.string().min(2).optional(),
    timezone: z.string().optional(),
    active: z.boolean().optional(),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
  }).refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
  }),
});
