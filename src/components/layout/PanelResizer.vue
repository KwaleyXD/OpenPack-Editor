<script setup lang="ts">
import { onBeforeUnmount } from "vue";

const props = withDefaults(defineProps<{
  modelValue: number;
  min: number;
  max: number;
  label: string;
  reverse?: boolean;
  horizontal?: boolean;
}>(), { reverse: false, horizontal: false });
const emit = defineEmits<{ "update:modelValue": [number]; change: [] }>();
let drag: { coordinate: number; size: number; pointerId: number } | null = null;

function resize(size: number) {
  emit("update:modelValue", Math.round(Math.max(props.min, Math.min(props.max, size))));
}
function move(event: PointerEvent) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  const coordinate = props.horizontal ? event.clientY : event.clientX;
  resize(drag.size + (coordinate - drag.coordinate) * (props.reverse ? -1 : 1));
}
function stop() {
  if (drag) emit("change");
  drag = null;
  window.removeEventListener("pointermove", move);
  window.removeEventListener("pointerup", stop);
  window.removeEventListener("pointercancel", stop);
  window.removeEventListener("blur", stop);
}
function start(event: PointerEvent) {
  if (event.button !== 0) return;
  event.preventDefault();
  stop();
  (event.currentTarget as HTMLElement).focus();
  drag = { coordinate: props.horizontal ? event.clientY : event.clientX, size: props.modelValue, pointerId: event.pointerId };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", stop);
  window.addEventListener("pointercancel", stop);
  window.addEventListener("blur", stop);
}
function keyboard(event: KeyboardEvent) {
  const decrease = props.horizontal ? "ArrowUp" : "ArrowLeft";
  const increase = props.horizontal ? "ArrowDown" : "ArrowRight";
  if (![decrease, increase, "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  resize(event.key === "Home" ? props.min : event.key === "End" ? props.max :
    props.modelValue + (event.key === increase ? 1 : -1) * (props.reverse ? -1 : 1) * (event.shiftKey ? 40 : 10));
  emit("change");
}
onBeforeUnmount(stop);
</script>

<template>
  <div role="separator" tabindex="0" :aria-label="label" :title="`${label}: drag or use arrow keys`"
    :aria-orientation="horizontal ? 'horizontal' : 'vertical'"
    :aria-valuemin="min" :aria-valuemax="max" :aria-valuenow="modelValue"
    class="z-10 shrink-0 touch-none bg-zinc-600 hover:bg-sky-400 focus-visible:bg-sky-400 focus-visible:outline-none"
    :class="horizontal ? 'h-1.5 w-full cursor-row-resize' : 'h-full w-1.5 cursor-col-resize'"
    @pointerdown="start" @keydown="keyboard" />
</template>
