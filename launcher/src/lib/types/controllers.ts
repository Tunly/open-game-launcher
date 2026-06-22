export type ControllerType = "xbox" | "playstation" | "switch" | "steam" | "generic";
export type ControllerTemplate = "gamepad" | "gamepadGyro" | "keyboardMouse" | "disabled";

export interface ControllerDevice {
  id: string;
  name: string;
  vendorId?: number | null;
  productId?: number | null;
  controllerType: ControllerType;
  powerLevel?: string | null;
  isConnected: boolean;
  source: string;
}

export interface ControllerMappingBinding {
  input: string;
  output: string;
}

export interface ControllerRuntimeStatus {
  activeGameId?: string | null;
  activeLayoutName?: string | null;
  activeTemplate?: ControllerTemplate | null;
  nativePassthroughReady: boolean;
  keyboardMouseEmulationReady: boolean;
  vigemBusDetected: boolean;
  driverMessage: string;
  configPath?: string | null;
}

export interface ControllerLayout {
  id: string;
  userId: string;
  gameId: string | null;
  name: string;
  controllerType: ControllerType;
  template: ControllerTemplate;
  bindings: ControllerMappingBinding[];
  gyroEnabled: boolean;
  hapticsEnabled: boolean;
  isCommunity: boolean;
  isDefault: boolean;
  authorName: string | null;
  createdAt: string;
  downloadCount?: number;
  moderationStatus?: "approved" | "pending" | "rejected";
  reportCount?: number;
  updatedAt: string;
  userVote?: -1 | 0 | 1;
  voteScore?: number;
}

export const CONTROLLER_INPUTS = [
  "A / Cross",
  "B / Circle",
  "X / Square",
  "Y / Triangle",
  "LB / L1",
  "RB / R1",
  "LT / L2",
  "RT / R2",
  "Left Stick Click",
  "Right Stick Click",
  "D-Pad Up",
  "D-Pad Down",
  "D-Pad Left",
  "D-Pad Right",
  "Menu / Start",
  "View / Select",
] as const;

export const CONTROLLER_OUTPUTS = [
  ...CONTROLLER_INPUTS,
  "W",
  "A",
  "S",
  "D",
  "Space",
  "Left Shift",
  "Left Ctrl",
  "E",
  "F",
  "R",
  "Tab",
  "Escape",
  "Enter",
  "Mouse Left",
  "Mouse Right",
  "Mouse Middle",
] as const;

export const DEFAULT_CONTROLLER_BINDINGS: ControllerMappingBinding[] = CONTROLLER_INPUTS.map(
  (input) => ({
    input,
    output: input,
  }),
);
