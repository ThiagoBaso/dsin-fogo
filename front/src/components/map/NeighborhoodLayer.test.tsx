import React from 'react';
import { render } from '@testing-library/react';
import { GeoJSON } from 'react-leaflet';
import NeighborhoodLayer from './NeighborhoodLayer';

jest.mock('react-leaflet', () => ({ GeoJSON: jest.fn(() => null) }));

const geoJsonMock = GeoJSON as unknown as jest.Mock;

beforeEach(() => geoJsonMock.mockClear());

test('uses a brighter, thicker neighborhood outline in the dark theme', () => {
  render(<NeighborhoodLayer enabled dark />);

  const props = geoJsonMock.mock.calls[0][0] as {
    style: (feature: { properties: { id: number } }) => { color: string; weight: number; opacity: number };
  };

  expect(props.style({ properties: { id: 1 } })).toMatchObject({
    color: '#e2e8f0',
    weight: 2,
    opacity: 1,
  });
});

test('keeps the existing light-theme neighborhood outline', () => {
  render(<NeighborhoodLayer enabled />);

  const props = geoJsonMock.mock.calls[0][0] as {
    style: (feature: { properties: { id: number } }) => { color: string; weight: number; opacity: number };
  };

  expect(props.style({ properties: { id: 1 } })).toMatchObject({
    color: '#3c4548',
    weight: 1.5,
    opacity: 0.95,
  });
});
