// Only the icons the app uses are bundled (inline SVG, Material Symbols Rounded).
const files = import.meta.glob(
  '/node_modules/@material-symbols/svg-400/rounded/{add,fullscreen,fullscreen_exit,line_weight,lens_blur,timeline,tune,help,format_paint,deselect,conversion_path,update,smart_display,smart_display-fill,keyboard_arrow_down,keyboard_arrow_up,play_circle,close,folder_open,save,save_as,check,flip,polyline,polyline-fill,join,ink_eraser_off,cleaning_bucket,add_photo_alternate,arrow_selector_tool,arrow_selector_tool-fill,brush,brush-fill,colorize,colorize-fill,content_copy,contrast,delete,download,draw-fill,edit,edit-fill,fit_screen,format_color_fill,format_color_fill-fill,gesture,image,ink_eraser,ink_eraser-fill,layers_clear,lock,lock_open,more_vert,note_add,opacity,pan_tool,pan_tool-fill,redo,remove,right_panel_close,right_panel_open,stylus,texture,undo,vertical_align_bottom,visibility,visibility_off,zoom_in}.svg',
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;

export const icons: Record<string, string> = {};
for (const [path, svg] of Object.entries(files)) {
  icons[path.slice(path.lastIndexOf('/') + 1, -4)] = svg;
}
