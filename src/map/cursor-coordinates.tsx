import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useAtomValue } from "jotai";
import type { MapEngine } from "@epanet-js/map";
import type { MapMouseEvent } from "mapbox-gl";
import { useLocale } from "src/hooks/use-locale";
import { useTranslate } from "src/hooks/use-translate";
import { getCursorCoordinates } from "src/lib/cursor-coordinates";
import { showGridAtom } from "src/state/map-projection";

export const MapCursorCoordinates = ({ map }: { map: MapEngine | null }) => {
  const translate = useTranslate();
  const { locale } = useLocale();
  const isGridOn = useAtomValue(showGridAtom);
  const elementRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{
    map: MapEngine;
    longitude: number;
    latitude: number;
  } | null>(null);
  const [placement, setPlacement] = useState<CSSProperties>({
    right: 8,
    bottom: 8,
  });
  const numberFormatter = useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        minimumFractionDigits: 6,
        maximumFractionDigits: 6,
        useGrouping: false,
      }),
    [locale],
  );

  useEffect(() => {
    setPosition(null);
    if (!map || isGridOn) return;
    let frame: number | null = null;
    let inside = false;
    let disposed = false;
    let pointX = 0;
    let pointY = 0;
    let clientX = 0;
    let clientY = 0;
    let longitude = 0;
    let latitude = 0;

    const queuePosition = (lng: number, lat: number) => {
      longitude = lng;
      latitude = lat;
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        if (disposed) return;
        const coordinates = getCursorCoordinates(longitude, latitude);
        if (!coordinates) return;
        setPosition((previous) =>
          previous?.map === map &&
          previous.longitude === coordinates.longitude &&
          previous.latitude === coordinates.latitude
            ? previous
            : { map, ...coordinates },
        );
      });
    };
    const handlePointer = (event: MapMouseEvent) => {
      inside = true;
      pointX = event.point.x;
      pointY = event.point.y;
      clientX = event.originalEvent.clientX;
      clientY = event.originalEvent.clientY;
      queuePosition(event.lngLat.lng, event.lngLat.lat);
    };
    const handleLeave = () => {
      inside = false;
    };
    const handleMove = () => {
      if (!inside || !map.isAlive()) return;
      const coordinate = map.map.unproject([pointX, pointY]);
      queuePosition(coordinate.lng, coordinate.lat);
    };
    const handleResize = () => {
      if (!inside || !map.isAlive()) return;
      const bounds = map.map.getCanvas().getBoundingClientRect();
      pointX = clientX - bounds.left;
      pointY = clientY - bounds.top;
      inside =
        pointX >= 0 &&
        pointX <= bounds.width &&
        pointY >= 0 &&
        pointY <= bounds.height;
      handleMove();
    };

    map.map.on("mousemove", handlePointer);
    map.map.on("click", handlePointer);
    map.map.on("mouseout", handleLeave);
    map.map.on("move", handleMove);
    map.map.on("resize", handleResize);
    return () => {
      disposed = true;
      map.map.off("mousemove", handlePointer);
      map.map.off("click", handlePointer);
      map.map.off("mouseout", handleLeave);
      map.map.off("move", handleMove);
      map.map.off("resize", handleResize);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [map, isGridOn]);

  useLayoutEffect(() => {
    const element = elementRef.current;
    const container = element?.parentElement;
    if (!element || !container || !map || isGridOn) return;
    const attribution = container.querySelector<HTMLElement>(
      ".mapboxgl-ctrl-bottom-right > .mapboxgl-ctrl-attrib",
    );
    const logo = container.querySelector<HTMLElement>(".mapboxgl-ctrl-logo");
    const credits = container.ownerDocument.createRange();
    let googleAttribution: HTMLElement | null = null;
    const updatePlacement = () => {
      const bounds = container.getBoundingClientRect();
      const creditsBounds = attribution?.getBoundingClientRect();
      const creditText = attribution?.querySelector(
        ".mapboxgl-ctrl-attrib-inner",
      );
      if (creditText) credits.selectNodeContents(creditText);
      const creditTextBounds = creditText
        ? credits.getBoundingClientRect()
        : creditsBounds;
      const logoRight = logo?.getBoundingClientRect().right ?? bounds.left + 8;
      const style = getComputedStyle(element);
      const timelineHeight =
        Number.parseFloat(
          style.getPropertyValue("--simulation-controls-height"),
        ) || 0;
      const rem = Number.parseFloat(
        getComputedStyle(element.ownerDocument.documentElement).fontSize,
      );
      const children = Array.from(element.children);
      const width =
        Math.max(
          ...children.map((child) => child.getBoundingClientRect().width),
        ) +
        Number.parseFloat(style.paddingLeft || "0") +
        Number.parseFloat(style.paddingRight || "0");
      const creditsVisible =
        creditsBounds &&
        creditTextBounds &&
        creditTextBounds.width > 0 &&
        creditTextBounds.height > 0;
      const googleBounds = googleAttribution?.getBoundingClientRect();
      const googleVisible =
        googleBounds && googleBounds.width > 0 && googleBounds.height > 0;
      const right = creditsVisible
        ? bounds.right - creditTextBounds.left + 8
        : 8;
      const availableWidth = bounds.right - right - logoRight - 8;
      const next: CSSProperties =
        width <= availableWidth
          ? {
              right,
              bottom: creditsVisible
                ? Math.max(8, bounds.bottom - creditsBounds.bottom)
                : 8,
            }
          : {
              right: 8,
              bottom: googleVisible
                ? Math.max(8, bounds.bottom - googleBounds.top + 8)
                : timelineHeight + 2 * rem,
            };
      if (
        width > availableWidth &&
        typeof next.bottom === "number" &&
        next.bottom + element.getBoundingClientRect().height > bounds.height - 8
      ) {
        next.top = 8;
        next.bottom = undefined;
      }
      setPlacement((previous) =>
        previous.right === next.right &&
        previous.left === next.left &&
        previous.bottom === next.bottom &&
        previous.top === next.top
          ? previous
          : next,
      );
    };
    const observer = new ResizeObserver(updatePlacement);
    observer.observe(container);
    observer.observe(element);
    for (const child of element.children) observer.observe(child);
    if (attribution) observer.observe(attribution);
    if (logo) observer.observe(logo);
    const refreshAttribution = () => {
      const next = container.querySelector<HTMLElement>(
        '[data-map-attribution="google"]',
      );
      if (next !== googleAttribution) {
        if (googleAttribution) observer.unobserve(googleAttribution);
        googleAttribution = next;
        if (googleAttribution) observer.observe(googleAttribution);
      }
      updatePlacement();
    };
    const mutations = new MutationObserver(refreshAttribution);
    mutations.observe(container, { childList: true, subtree: true });
    if (container.parentElement)
      mutations.observe(container.parentElement, {
        attributes: true,
        attributeFilter: ["style"],
      });
    refreshAttribution();
    return () => {
      observer.disconnect();
      mutations.disconnect();
    };
  }, [map, isGridOn]);

  if (!map || isGridOn) return null;
  const coordinates = position?.map === map ? position : null;

  return (
    <div
      ref={elementRef}
      role="group"
      aria-label={translate("mapCursorCoordinates.label")}
      aria-live="off"
      className="pointer-events-none absolute z-10 flex flex-col items-start rounded-sm bg-popover/40 px-1.5 text-size-small leading-3 tabular-nums text-default"
      style={placement}
    >
      <span className="whitespace-nowrap">
        <abbr
          title={translate("mapCursorCoordinates.longitude")}
          className="no-underline"
        >
          {translate("mapCursorCoordinates.longitudeShort")}
        </abbr>
        : {coordinates ? numberFormatter.format(coordinates.longitude) : "—"}
      </span>
      <span className="whitespace-nowrap">
        <abbr
          title={translate("mapCursorCoordinates.latitude")}
          className="no-underline"
        >
          {translate("mapCursorCoordinates.latitudeShort")}
        </abbr>
        : {coordinates ? numberFormatter.format(coordinates.latitude) : "—"}
      </span>
    </div>
  );
};
