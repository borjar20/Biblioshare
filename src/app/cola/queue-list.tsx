"use client";

import { useState, useTransition } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import type { ItemEstimate, QueueItem } from "@/lib/queue/types";
import { reorderQueue } from "./actions";
import { QueueItemRow } from "./queue-item-row";

export function QueueList({
  items,
  estimates,
}: {
  items: QueueItem[];
  estimates: Record<string, ItemEstimate>;
}) {
  const [orderedItems, setOrderedItems] = useState(items);
  const [, startTransition] = useTransition();

  // Keyboard sensor isn't just a nicety — drag-and-drop needs a non-pointer
  // path for real accessibility (WCAG), and it's also what makes this
  // reorderable via automated/keyboard-only testing.
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = orderedItems.findIndex((item) => item.entryId === active.id);
    const newIndex = orderedItems.findIndex((item) => item.entryId === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const previous = orderedItems;
    const next = arrayMove(orderedItems, oldIndex, newIndex);
    setOrderedItems(next);

    startTransition(async () => {
      const result = await reorderQueue(next.map((item) => item.entryId));
      if (result.error) setOrderedItems(previous);
    });
  }

  return (
    // Fixed id: dnd-kit's default id is an incrementing counter, which
    // mismatches between the server-rendered instance and the client's
    // fresh mount and trips a hydration warning.
    <DndContext
      id="queue-list"
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={orderedItems.map((item) => item.entryId)}
        strategy={verticalListSortingStrategy}
      >
        <ul className="flex flex-col gap-2">
          {orderedItems.map((item) => (
            <QueueItemRow key={item.entryId} item={item} estimate={estimates[item.entryId]} />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}
