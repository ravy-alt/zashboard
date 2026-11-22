<template>
  <div
    ref="parentRef"
    class="base-container isolate m-3 h-full overflow-auto backdrop-blur-none!"
    data-page-swipe-ignore
  >
    <div
      class="table-glass"
      :class="resizable ? 'min-w-max' : 'min-w-min'"
    >
      <table
        :class="['table', sizeOfTable, tableClass, resizable && 'table-fixed']"
        :style="resizable ? { width: `${tanstackTable.getCenterTotalSize()}px` } : undefined"
      >
        <thead
          class="bg-base-100 border-base-300/60 sticky top-0 z-10 border-b backdrop-blur-none!"
        >
          <tr
            v-for="headerGroup in tanstackTable.getHeaderGroups()"
            :key="headerGroup.id"
          >
            <th
              v-for="header in headerGroup.headers"
              :key="header.id"
              :colSpan="header.colSpan"
              :data-column="header.column.id"
              :aria-sort="
                header.column.getIsSorted() === 'asc'
                  ? 'ascending'
                  : header.column.getIsSorted() === 'desc'
                    ? 'descending'
                    : undefined
              "
              :style="resizable ? { width: `${header.getSize()}px` } : undefined"
              :class="[
                'relative',
                inheritedStyle,
                pinFirstColumn && header.index === 0 && 'pinned-td sticky left-0 z-20',
                header.column.columnDef.meta?.headerClass,
                header.column.getCanSort() && 'cursor-pointer select-none',
              ]"
              @click="header.column.getToggleSortingHandler()?.($event)"
            >
              <div class="inline-flex items-center gap-1 whitespace-nowrap">
                <FlexRender
                  v-if="!header.isPlaceholder"
                  :render="header.column.columnDef.header"
                  :props="header.getContext()"
                />
                <ArrowUpCircleIcon
                  v-if="header.column.getIsSorted() === 'asc'"
                  class="h-4 w-4"
                />
                <ArrowDownCircleIcon
                  v-if="header.column.getIsSorted() === 'desc'"
                  class="h-4 w-4"
                />
              </div>
              <div
                v-if="resizable && header.column.getCanResize()"
                class="dns-column-resizer hover:bg-primary/50 absolute top-0 right-0 h-full w-1 cursor-ew-resize touch-none select-none"
                :data-resize-column="header.column.id"
                @dblclick.stop="header.column.resetSize()"
                @click.stop
                @mousedown.stop="header.getResizeHandler()($event)"
                @touchstart.stop="header.getResizeHandler()($event)"
              />
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="rows.length === 0">
            <td
              :colspan="tanstackTable.getVisibleLeafColumns().length"
              class="text-base-content/50 h-90"
            >
              <div class="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
                <CircleStackIcon class="h-10 w-10 opacity-60" />
                <div class="text-base">{{ t('noData') }}</div>
              </div>
            </td>
          </tr>
          <template v-else>
            <tr
              v-if="paddingTop > 0"
              :style="{ height: `${paddingTop}px` }"
            ></tr>
            <tr
              v-for="virtualRow in virtualRows"
              :key="virtualRow.key.toString()"
              :ref="dynamicRowHeight ? measureRow : undefined"
              :data-index="virtualRow.index"
              :data-testid="rowTestId"
              :data-row-id="rows[virtualRow.index].id"
              :style="dynamicRowHeight ? undefined : { height: `${estimateSize}px` }"
              class="hover:bg-(--table-hover)!"
              :class="[
                virtualRow.index % 2 === 0 && 'table-row-stripe',
                rowClass?.(rows[virtualRow.index].original),
              ]"
              @click="emits('rowClick', rows[virtualRow.index].original)"
            >
              <td
                v-for="(cell, cellIndex) in rows[virtualRow.index].getVisibleCells()"
                :key="cell.id"
                :data-column="cell.column.id"
                class="truncate text-sm whitespace-nowrap"
                :class="[
                  !resizable && 'max-w-xl',
                  cell.column.columnDef.meta?.cellClass,
                  pinFirstColumn && cellIndex === 0 && 'pinned-td sticky left-0 z-20',
                ]"
                :title="cellTitle(cell)"
                @contextmenu="handleCellRightClick($event, cell)"
              >
                <FlexRender
                  v-if="!cell.getIsPlaceholder()"
                  :render="cell.column.columnDef.cell"
                  :props="cell.getContext()"
                />
              </td>
            </tr>
            <tr
              v-if="paddingBottom > 0"
              :style="{ height: `${paddingBottom}px` }"
            ></tr>
          </template>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts" generic="T">
import { TABLE_SIZE } from '@/constant'
import { backgroundImage } from '@/helper/indexeddb'
import { showNotification } from '@/helper/notification'
import { useStorage } from '@/composables/use-storage'
import { tableSize } from '@/store/settings'
import { ArrowDownCircleIcon, ArrowUpCircleIcon, CircleStackIcon } from '@heroicons/vue/24/outline'
import {
  FlexRender,
  getCoreRowModel,
  getSortedRowModel,
  isFunction,
  useVueTable,
  type Cell,
  type ColumnDef,
  type ColumnSizingState,
  type SortingState,
  type VisibilityState,
} from '@tanstack/vue-table'
import { useVirtualizer } from '@tanstack/vue-virtual'
import { computed, ref, type ComponentPublicInstance } from 'vue'
import { useI18n } from 'vue-i18n'

const props = withDefaults(
  defineProps<{
    data: T[]
    columns: ColumnDef<T>[]
    sortingKey: string
    initialSorting?: SortingState
    estimateSize?: number
    overscan?: number
    columnVisibility?: VisibilityState
    rowClass?: (row: T) => string | undefined
    tableClass?: string
    resizable?: boolean
    dynamicRowHeight?: boolean
    rowTestId?: string
    getRowId?: (row: T) => string
    pinFirstColumn?: boolean
  }>(),
  {
    estimateSize: 36,
    overscan: 24,
  },
)

const emits = defineEmits<{
  (e: 'rowClick', row: T): void
}>()

const { t } = useI18n()

const sorting = useStorage<SortingState>(props.sortingKey, () => props.initialSorting ?? [])
const columnSizing = useStorage<ColumnSizingState>(`${props.sortingKey}/column-widths`, {})

const tanstackTable = useVueTable({
  get data() {
    return props.data
  },
  get columns() {
    return props.columns
  },
  state: {
    get columnSizing() {
      return columnSizing.value
    },
    get sorting() {
      return sorting.value
    },
    get columnVisibility() {
      return props.columnVisibility ?? {}
    },
  },
  getRowId: (row, index) => props.getRowId?.(row) ?? String(index),
  columnResizeMode: 'onChange',
  defaultColumn: { minSize: 60 },
  onColumnSizingChange: (updater) => {
    columnSizing.value = isFunction(updater) ? updater(columnSizing.value) : updater
  },
  onSortingChange: (updater) => {
    sorting.value = isFunction(updater) ? updater(sorting.value) : updater
  },
  getSortedRowModel: getSortedRowModel(),
  getCoreRowModel: getCoreRowModel(),
})

const rows = computed(() => tanstackTable.getRowModel().rows)

const parentRef = ref<HTMLElement | null>(null)
const rowVirtualizerOptions = computed(() => {
  return {
    count: rows.value.length,
    getItemKey: (index: number) => rows.value[index].id,
    getScrollElement: () => parentRef.value,
    estimateSize: () => props.estimateSize,
    overscan: props.overscan,
  }
})

const rowVirtualizer = useVirtualizer(rowVirtualizerOptions)
const measureRow = (element: Element | ComponentPublicInstance | null) => {
  rowVirtualizer.value.measureElement(element instanceof HTMLElement ? element : null)
}
const virtualRows = computed(() => rowVirtualizer.value.getVirtualItems())
const paddingTop = computed(() => virtualRows.value[0]?.start ?? 0)
const paddingBottom = computed(() => {
  const last = virtualRows.value[virtualRows.value.length - 1]

  if (!last) {
    return 0
  }

  return rowVirtualizer.value.getTotalSize() - last.end
})

const classMap = {
  [TABLE_SIZE.SMALL]: 'table-xs',
  [TABLE_SIZE.LARGE]: 'table-sm',
}
const sizeOfTable = computed(() => classMap[tableSize.value])

const inheritedStyle = computed(() => {
  const baseStyle = 'bg-inherit'

  if (!backgroundImage.value) {
    return baseStyle
  }

  return `${baseStyle} backdrop-blur-sm`
})

const cellTitle = (cell: Cell<T, unknown>) => {
  if (cell.column.columnDef.meta?.noCellTitle) {
    return undefined
  }

  const value = cell.getValue()

  return typeof value === 'string' || typeof value === 'number' ? String(value) : undefined
}

const copyToClipboard = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text)
    showNotification({
      content: 'copySuccess',
      type: 'alert-success',
      timeout: 2000,
    })
  } catch {
    const textArea = document.createElement('textarea')

    textArea.value = text
    document.body.appendChild(textArea)
    textArea.select()
    try {
      document.execCommand('copy')
      showNotification({
        content: 'copySuccess',
        type: 'alert-success',
        timeout: 2000,
      })
    } catch (error) {
      console.error('复制失败:', error)
    }
    document.body.removeChild(textArea)
  }
}

const handleCellRightClick = (event: MouseEvent, cell: Cell<T, unknown>) => {
  const cellValue = cellTitle(cell)

  if (cellValue && cellValue !== '-') {
    event.preventDefault()
    copyToClipboard(cellValue)
  }
}
</script>

<style scoped>
.pinned-td {
  background-color: var(--color-base-100);
}
tr.table-row-stripe > .pinned-td {
  background-image: linear-gradient(var(--table-stripe), var(--table-stripe));
}
tr:hover > .pinned-td {
  background-image: linear-gradient(var(--table-hover), var(--table-hover));
}
</style>
