// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import type { ProtocolBindingState } from "@sage/contracts/projects";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../../ui/toast";
import { installTestingApi, makePlan } from "../testing/testing-api.fixture.js";
import { ProtocolBindings } from "./ProtocolBindings.js";

const update = vi.fn();
const streams = vi.fn();

function Wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={client}><ToastProvider>{children}</ToastProvider></QueryClientProvider>;
}

const bound: ProtocolBindingState = {
  alias: "dut_cmd", icd: "dut_cmd", source: { hardwareId: "COM", streamId: "tx" }, ok: true
} as ProtocolBindingState;

beforeEach(() => {
  installTestingApi([makePlan()]);
  update.mockResolvedValue([]);
  streams.mockResolvedValue([
    { hardwareId: "COM", label: "串口", known: true, streams: [
      { id: "rx", type: "bytes" }, { id: "tx", type: "bytes" }, { id: "level", type: "scalar" },
      { id: "dut_cmd.status.code", type: "scalar", derived: { sourceStreamId: "tx", field: "code" } }
    ] },
    { hardwareId: "CAN", label: "CAN 卡", known: true, streams: [{ id: "bus", type: "frames" }] }
  ]);
  Object.assign(window.sage, {
    protocols: { list: vi.fn(async () => []), update },
    monitor: { streams }
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ProtocolBindings", () => {
  it("offers the free raw streams of the protocol's type and binds one under a free alias", async () => {
    const onBound = vi.fn();
    render(
      <ProtocolBindings icd="dut_cmd" transport="bytes" bindings={[bound]} aliases={["dut_cmd"]} onBound={onBound}
        pending={{ hardwareId: "COM", streamId: "rx", streamType: "bytes" }} />,
      { wrapper: Wrapper }
    );
    // The stream the operator came for is preselected; bound, typed-wrong and value streams are not offered.
    expect(await screen.findByRole("option", { name: "串口 / rx" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: /tx/ })).toBeNull();
    expect(screen.queryByRole("option", { name: /bus/ })).toBeNull();
    expect(screen.queryByRole("option", { name: /level/ })).toBeNull();
    expect(screen.getByText("COM/tx")).toBeTruthy();
    const alias = screen.getByRole("textbox", { name: "别名" }) as HTMLInputElement;
    expect(alias.value).toBe("dut_cmd2");
    await userEvent.click(screen.getByRole("button", { name: "绑定" }));
    await waitFor(() => expect(update).toHaveBeenCalledWith({
      input: {
        operations: [{ op: "add", icd: "dut_cmd", alias: "dut_cmd2", source: { hardwareId: "COM", streamId: "rx" } }]
      }
    }));
    await waitFor(() => expect(onBound).toHaveBeenCalled());
  });

  it("refuses an alias that is taken or not a name", async () => {
    render(<ProtocolBindings icd="dut_cmd" transport="bytes" bindings={[]} aliases={["dut"]} />, { wrapper: Wrapper });
    await screen.findByRole("option", { name: "串口 / rx" });
    const alias = screen.getByRole("textbox", { name: "别名" });
    fireEvent.change(alias, { target: { value: "dut" } });
    expect(screen.getByText("别名 dut 已被使用")).toBeTruthy();
    fireEvent.change(alias, { target: { value: "1x" } });
    expect(screen.getByText(/别名只能包含/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "绑定" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("unbinds after a confirmation, and waits for a new protocol to be saved before binding it", async () => {
    const view = render(<ProtocolBindings icd="dut_cmd" transport="bytes" bindings={[bound]} aliases={["dut_cmd"]} />,
      { wrapper: Wrapper });
    await userEvent.click(screen.getByRole("button", { name: "解除协议 dut_cmd" }));
    await userEvent.click(await screen.findByRole("button", { name: "解除" }));
    await waitFor(() => expect(update).toHaveBeenCalledWith({
      input: { operations: [{ op: "remove", alias: "dut_cmd" }] }
    }));
    view.unmount();
    render(<ProtocolBindings icd={undefined} bindings={[]} aliases={[]} />, { wrapper: Wrapper });
    expect(screen.getByText(/保存这份协议后/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "绑定" })).toBeNull();
  });
});
