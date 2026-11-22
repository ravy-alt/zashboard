<template>
  <div
    class="flex min-w-0 items-center gap-1 overflow-hidden whitespace-nowrap"
    :title="nodes.join(' → ')"
    data-testid="dns-chain"
  >
    <template
      v-for="(node, index) in nodes"
      :key="index"
    >
      <ArrowRightCircleIcon
        v-if="index"
        class="size-4 shrink-0"
        aria-hidden="true"
      />
      <span
        class="truncate"
        :class="index === nodes.length - 1 ? 'min-w-0' : 'shrink-0'"
        >{{ node }}</span
      >
    </template>
  </div>
</template>

<script setup lang="ts">
import { ArrowRightCircleIcon } from '@heroicons/vue/24/outline'
defineProps<{ nodes: string[] }>()
</script>
