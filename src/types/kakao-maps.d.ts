export {};

declare global {
  namespace kakao.maps {
    function load(callback: () => void): void;

    class LatLng {
      constructor(latitude: number, longitude: number);
      getLat(): number;
      getLng(): number;
    }

    class LatLngBounds {
      constructor();
      extend(latLng: LatLng): void;
    }

    class Map {
      constructor(
        container: HTMLElement,
        options: { center: LatLng; level?: number },
      );
      setCenter(latLng: LatLng): void;
      panTo(latLng: LatLng): void;
      setLevel(level: number): void;
      setBounds(
        bounds: LatLngBounds,
        paddingTop?: number,
        paddingRight?: number,
        paddingBottom?: number,
        paddingLeft?: number,
      ): void;
      relayout(): void;
    }

    class Polyline {
      constructor(options: {
        map?: Map;
        path: LatLng[];
        strokeWeight?: number;
        strokeColor?: string;
        strokeOpacity?: number;
        strokeStyle?: string;
      });
      setMap(map: Map | null): void;
    }

    class CustomOverlay {
      constructor(options: {
        map?: Map;
        position: LatLng;
        content: HTMLElement | string;
        xAnchor?: number;
        yAnchor?: number;
        zIndex?: number;
      });
      setMap(map: Map | null): void;
      setPosition(position: LatLng): void;
      setContent(content: HTMLElement | string): void;
    }

    class Circle {
      constructor(options: { map?: Map; center: LatLng; radius: number; strokeWeight?: number; strokeColor?: string; fillColor?: string; fillOpacity?: number });
      setMap(map: Map | null): void;
      setPosition(position: LatLng): void;
      setRadius(radius: number): void;
    }

    namespace event {
      function addListener(target: Map, type: "dragstart", handler: () => void): void;
      function addListener(target: Map, type: "click", handler: (event: { latLng: LatLng }) => void): void;
      function removeListener(target: Map, type: "dragstart", handler: () => void): void;
      function removeListener(target: Map, type: "click", handler: (event: { latLng: LatLng }) => void): void;
    }
  }

  interface Window {
    kakao?: {
      maps: typeof kakao.maps;
    };
  }
}
