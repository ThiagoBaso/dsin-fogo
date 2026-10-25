import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import LocationMiniMap from './LocationMiniMap';

jest.mock('react-leaflet', () => {
  const react = jest.requireActual('react');
  return {
    MapContainer: (props: { children?: unknown }) => react.createElement('div', { 'data-testid': 'mini-map' }, props.children),
    TileLayer: () => null,
    useMap: () => ({ setView: () => undefined, getPane: () => null }),
  };
});

jest.mock('./map/EquipmentMarkers', () => () => null);
jest.mock('./map/AgentMarkers', () => () => null);

test('allows the location mini map to be collapsed and expanded', () => {
  render(
    <LocationMiniMap position={[-22.21, -49.95]} dark={false}>
      <span>Selected marker</span>
    </LocationMiniMap>,
  );

  const toggle = screen.getByRole('button');
  expect(toggle).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByTestId('mini-map')).toBeInTheDocument();

  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByTestId('mini-map')).not.toBeInTheDocument();

  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByTestId('mini-map')).toBeInTheDocument();
});
