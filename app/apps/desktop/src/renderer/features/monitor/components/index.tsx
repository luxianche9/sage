import type { ComponentType, ReactNode } from "react";
import type { PanelType } from "@sage/contracts/monitor";
import {
  ActivityIcon, BracesIcon, CircleDotIcon, GaugeIcon, GroupIcon, ListChecksIcon, ListFilterIcon, MousePointerClickIcon,
  SlidersHorizontalIcon, SquareTerminalIcon, Table2Icon, ToggleLeftIcon, TypeIcon
} from "lucide-react";
import type { ComponentProps } from "../panel-kit.js";
import { ButtonComponent, SelectComponent, SliderComponent, SwitchComponent } from "./controls.js";
import {
  GroupComponent, LabelComponent, LampComponent, NumberComponent, ResultsComponent, ValuesComponent
} from "./displays.js";
import { TerminalComponent, TraceComponent } from "./records.js";
import { ScopeComponent } from "./Scope.js";

/** What draws each component of the canvas. */
export const COMPONENTS: Readonly<Record<PanelType, ComponentType<ComponentProps>>> = {
  scope: ScopeComponent,
  number: NumberComponent,
  values: ValuesComponent,
  lamp: LampComponent,
  terminal: TerminalComponent,
  trace: TraceComponent,
  button: ButtonComponent,
  switch: SwitchComponent,
  slider: SliderComponent,
  select: SelectComponent,
  results: ResultsComponent,
  label: LabelComponent,
  group: GroupComponent
};

export const COMPONENT_ICONS: Readonly<Record<PanelType, ReactNode>> = {
  scope: <ActivityIcon />,
  number: <GaugeIcon />,
  values: <Table2Icon />,
  lamp: <CircleDotIcon />,
  terminal: <SquareTerminalIcon />,
  trace: <BracesIcon />,
  button: <MousePointerClickIcon />,
  switch: <ToggleLeftIcon />,
  slider: <SlidersHorizontalIcon />,
  select: <ListFilterIcon />,
  results: <ListChecksIcon />,
  label: <TypeIcon />,
  group: <GroupIcon />
};
