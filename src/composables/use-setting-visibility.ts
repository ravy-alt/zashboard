import { isSettingSupported } from '@/helper/settings-support'
import { hiddenSettingsItems } from '@/store/settings'
import type { MaybeRef } from 'vue'
import { computed, unref } from 'vue'

export function useIsSettingVisible(key: MaybeRef<string>) {
  return computed(() => isSettingSupported(unref(key)) && !hiddenSettingsItems.value[unref(key)])
}
