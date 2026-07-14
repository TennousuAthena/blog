<template>
  <div class="tag-input">
    <div class="tag-input-inner">
      <span v-for="item in props.modelValue" :key="item" class="tag-input-tag">
        <span class="tag-input-tag-text">{{ item }}</span>
        <button type="button" class="tag-input-tag-remove" @click="removeItem(item)">
          <PhTrash :size="14" />
        </button>
      </span>
      <input
        v-model="inputValue"
        class="tag-input-input"
        @keyup="handleKeyup"
        @blur="handleBlur"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";

const props = defineProps<{
  modelValue: string[];
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: string[]): void;
}>();

const inputValue = ref("");

function addFromInput() {
  const raw = inputValue.value;
  if (!raw) {
    return;
  }
  const parts = raw
    .split(/[,，\s]+/)
    .map((d) => d.trim())
    .filter(Boolean);
  if (parts.length === 0) {
    inputValue.value = "";
    return;
  }
  const existing = new Set(props.modelValue);
  const next: string[] = [...props.modelValue];
  for (const part of parts) {
    if (!existing.has(part)) {
      next.push(part);
      existing.add(part);
    }
  }
  emit("update:modelValue", next);
  inputValue.value = "";
}

function handleKeyup(event: KeyboardEvent) {
  if (
    event.key === " " ||
    event.key === "Spacebar" ||
    event.key === "," ||
    event.key === "，" ||
    event.key === "Enter"
  ) {
    addFromInput();
  }
}

function handleBlur() {
  addFromInput();
}

function removeItem(value: string) {
  const next = props.modelValue.filter((item) => item !== value);
  emit("update:modelValue", next);
}
</script>

<style scoped lang="less">
.tag-input {
  padding: 4px 6px;
  border-radius: 4px;
  border: 1px solid var(--border-color);
  background-color: var(--bg-input);
}

.tag-input-inner {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.tag-input-tag {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  padding: 2px 8px;
  border-radius: 999px;
  background-color: var(--bg-sider);
  color: var(--text-primary);
  font-size: 13px;
  position: relative;
}

.tag-input-tag-text {
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tag-input-tag-remove {
  border: none;
  padding: 0;
  background: none;
  cursor: pointer;
  color: var(--text-secondary);
  font-size: 12px;
  opacity: 0;
  visibility: hidden;
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 100%;
  height: 100%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.tag-input-tag-remove:hover {
  color: var(--color-danger);
}

.tag-input-tag:hover .tag-input-tag-text {
  opacity: 0;
  visibility: hidden;
}

.tag-input-tag:hover .tag-input-tag-remove {
  opacity: 1;
  visibility: visible;
}

.tag-input-input {
  flex: 1;
  min-width: 120px;
  border: none;
  outline: none;
  background: transparent;
  padding: 4px 2px;
  font-size: 14px;
  color: var(--text-primary);
}
</style>
