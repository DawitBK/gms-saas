'use client';

import { useEffect } from 'react';

const JOIN_OFFICE_EVENT = 'gms:join-office';

export const useOfficeRealtime = (officeIds: Array<number | null | undefined>) => {
  useEffect(() => {
    const uniqueOfficeIds = [
      ...new Set(
        officeIds
          .map((value) => Number(value))
          .filter((value) => Number.isFinite(value) && value > 0)
      ),
    ];

    uniqueOfficeIds.forEach((officeId) => {
      window.dispatchEvent(new CustomEvent(JOIN_OFFICE_EVENT, { detail: { officeId } }));
    });
  }, [officeIds]);
};
