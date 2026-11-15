import type { AssistantState, ToolCallMessagePartComponent } from "@assistant-ui/react";
import { createContext, type ComponentType, type ReactNode } from "react";

export type ThreadComponents = {
  AssistantMessage?: ComponentType;
  Welcome?: ComponentType;
  Composer?: ReactNode;
  ToolFallback?: ToolCallMessagePartComponent;
};

export const EMPTY_COMPONENTS: ThreadComponents = {};
export const ThreadComponentsContext = createContext(EMPTY_COMPONENTS);

export const isNewChatView = (state: AssistantState) =>
  state.thread.messages.length === 0 && (!state.thread.isLoading || state.threads.isLoading);
