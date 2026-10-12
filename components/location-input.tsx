"use client";
import { useI18n } from "@/components/language-provider";
import React, { useId, useState } from "react";
import { matchingLocations } from "../lib/locations";
export function LocationInput({
  value,
  locations,
  onChange,
}: {
  value: string;
  locations: string[];
  onChange: (value: string) => void;
}) {
  const { tr } = useI18n();

  const id = useId(),
    listId = id + "-options";
  const [open, setOpen] = useState(false),
    [active, setActive] = useState(-1);
  const matches = matchingLocations(locations, value),
    visible = open && matches.length > 0;
  function choose(location: string) {
    onChange(location);
    setOpen(false);
    setActive(-1);
  }
  return (
    <div className="location-field">
      <label htmlFor={id}>
        {tr("session.location")}
        <input
          id={id}
          name="location"
          role="combobox"
          value={value}
          autoComplete="off"
          maxLength={200}
          aria-autocomplete="list"
          aria-expanded={visible}
          aria-controls={visible ? listId : undefined}
          aria-activedescendant={
            visible && active >= 0 ? listId + "-" + active : undefined
          }
          onFocus={() => setOpen(true)}
          onBlur={() => {
            setOpen(false);
            setActive(-1);
          }}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onKeyDown={(e) => {
            if (
              (e.key === "ArrowDown" || e.key === "ArrowUp") &&
              matches.length
            ) {
              e.preventDefault();
              setOpen(true);
              setActive(
                !visible
                  ? e.key === "ArrowDown"
                    ? 0
                    : matches.length - 1
                  : e.key === "ArrowDown"
                    ? (active + 1) % matches.length
                    : active <= 0
                      ? matches.length - 1
                      : active - 1,
              );
            } else if (e.key === "Enter" && visible && active >= 0) {
              e.preventDefault();
              choose(matches[active]);
            } else if (e.key === "Escape" && open) {
              e.preventDefault();
              setOpen(false);
              setActive(-1);
            } else if (e.key === "Tab") {
              setOpen(false);
              setActive(-1);
            }
          }}
        />
      </label>
      {visible && (
        <ul
          id={listId}
          className="location-suggestions"
          role="listbox"
          aria-label={tr("session.previousLocations")}
        >
          {matches.map((location, index) => (
            <li key={location} role="presentation">
              <button
                id={listId + "-" + index}
                type="button"
                role="option"
                aria-selected={active === index}
                tabIndex={-1}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(location)}
              >
                {location}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
