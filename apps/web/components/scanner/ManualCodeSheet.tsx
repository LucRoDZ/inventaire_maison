'use client';

import { useId } from 'react';
import type { ScanResult } from '../../lib/scanner/types';
import { BottomSheet } from '../ui/BottomSheet';
import { ManualCodeInput } from './ManualCodeInput';
import { PhotoCodeButton } from './PhotoCodeButton';

interface ManualCodeSheetProps {
  onCode: (result: ScanResult) => void;
  onClose: () => void;
}

/** Small sheet over the camera: typed code (or USB reader), or a photo of the barcode. */
export function ManualCodeSheet({ onCode, onClose }: ManualCodeSheetProps) {
  const titleId = useId();
  return (
    <BottomSheet labelledBy={titleId} onClose={onClose}>
      <h2 id={titleId} className="text-card-title">
        Saisir un code
      </h2>
      <ManualCodeInput onCode={onCode} />
      <PhotoCodeButton onCode={onCode} />
    </BottomSheet>
  );
}
