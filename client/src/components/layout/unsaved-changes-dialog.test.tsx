import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import UnsavedChangesDialog, { type UnsavedChangesDialogProps } from './unsaved-changes-dialog';

function setup(overrides: Partial<UnsavedChangesDialogProps> = {}) {
  const props: UnsavedChangesDialogProps = {
    open: true,
    canExportLive: true,
    onSave: vi.fn(),
    onExportSong: vi.fn(),
    onExportLive: vi.fn(),
    onDelete: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  };
  render(<UnsavedChangesDialog {...props} />);
  return props;
}

describe('UnsavedChangesDialog', () => {
  it('renders all exit actions', () => {
    setup();
    expect(screen.getByTestId('unsaved-save')).toBeTruthy();
    expect(screen.getByTestId('unsaved-export-song')).toBeTruthy();
    expect(screen.getByTestId('unsaved-export-live')).toBeTruthy();
    expect(screen.getByTestId('unsaved-delete')).toBeTruthy();
    expect(screen.getByTestId('unsaved-cancel')).toBeTruthy();
  });

  it('invokes each callback', async () => {
    const user = userEvent.setup();
    const props = setup();

    await user.click(screen.getByTestId('unsaved-save'));
    expect(props.onSave).toHaveBeenCalledTimes(1);

    await user.click(screen.getByTestId('unsaved-export-song'));
    expect(props.onExportSong).toHaveBeenCalledTimes(1);

    await user.click(screen.getByTestId('unsaved-export-live'));
    expect(props.onExportLive).toHaveBeenCalledTimes(1);

    await user.click(screen.getByTestId('unsaved-delete'));
    expect(props.onDelete).toHaveBeenCalledTimes(1);

    await user.click(screen.getByTestId('unsaved-cancel'));
    expect(props.onCancel).toHaveBeenCalledTimes(1);
  });

  it('disables live-set export when there is no recording', () => {
    setup({ canExportLive: false });
    expect(screen.getByTestId('unsaved-export-live')).toBeDisabled();
  });

  it('renders nothing when closed', () => {
    setup({ open: false });
    expect(screen.queryByTestId('unsaved-dialog')).toBeNull();
  });
});
