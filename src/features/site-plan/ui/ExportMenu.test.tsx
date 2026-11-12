import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ExportMenu from './ExportMenu';

describe('ExportMenu', () => {
  it('says which scheme and revision is being exported before any choice is made', () => {
    const run = vi.fn();
    render(
      <ExportMenu
        address="1710 Meharry Blvd"
        schemeName="Option 3"
        revision="de87f8d2"
        choices={[
          { key: 'site-plan', run },
          { key: '3d-image', run: () => undefined },
          { key: 'set', run: () => undefined },
        ]}
      />,
    );
    expect(screen.queryByText('Site plan PDF')).toBeNull();
    fireEvent.click(screen.getByTestId('export-menu'));
    const identity = screen.getByTestId('export-identity').textContent ?? '';
    expect(identity).toContain('1710 Meharry Blvd');
    expect(identity).toContain('Option 3');
    expect(identity).toContain('de87f8d2');
    expect(screen.getByText('3D image')).toBeTruthy();
    expect(screen.getByText('Full exhibit set')).toBeTruthy();
    fireEvent.click(screen.getByText('Site plan PDF'));
    expect(run).toHaveBeenCalledTimes(1);
    // the menu closes once a choice is made
    expect(screen.queryByText('Full exhibit set')).toBeNull();
  });

  it('gives the reason when nothing can be exported', () => {
    render(<ExportMenu address="x" schemeName="Current plan" revision={null} blocked="Generate a plan first" choices={[]} />);
    const button = screen.getByTestId('export-menu') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.title).toBe('Generate a plan first');
  });

  it('keeps a choice that cannot be made visible, with its reason', () => {
    const run = vi.fn();
    render(<ExportMenu address="x" schemeName="Current plan" revision={null} choices={[{ key: 'set', blocked: 'Nothing is drawn on the sheet yet', run }]} />);
    fireEvent.click(screen.getByTestId('export-menu'));
    fireEvent.click(screen.getByTestId('export-set'));
    expect(run).not.toHaveBeenCalled();
    expect(screen.getByText('Nothing is drawn on the sheet yet')).toBeTruthy();
  });
});
