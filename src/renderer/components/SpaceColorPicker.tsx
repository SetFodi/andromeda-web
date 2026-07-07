import {
  ColorArea,
  ColorField,
  ColorPicker,
  ColorSlider,
  ColorSwatch,
  ColorSwatchPicker
} from "./ui/heroui-color-picker";

type SpaceColorPickerProps = {
  defaultValue: string;
  swatches: string[];
  onPreview: (hex: string) => void;
};

// The full-spectrum space color editor, split out of Sidebar so the vendored
// HeroUI picker loads as its own lazy chunk the first time a space menu opens
// instead of riding in the startup bundle.
export default function SpaceColorPicker({ defaultValue, swatches, onPreview }: SpaceColorPickerProps) {
  return (
    <ColorPicker defaultValue={defaultValue} onChange={(next) => onPreview(next.toString("hex"))}>
      <ColorArea aria-label="Saturation and brightness">
        <ColorArea.Thumb />
      </ColorArea>
      <ColorSlider channel="hue" colorSpace="hsb" aria-label="Hue">
        <ColorSlider.Track>
          <ColorSlider.Thumb />
        </ColorSlider.Track>
      </ColorSlider>
      <ColorField aria-label="Hex color">
        <ColorField.Group>
          <ColorField.Prefix>
            <ColorSwatch size="xs" />
          </ColorField.Prefix>
          <ColorField.Input />
        </ColorField.Group>
      </ColorField>
      <ColorSwatchPicker className="space-color-swatches">
        {swatches.map((swatch) => (
          <ColorSwatchPicker.Item key={swatch} color={swatch}>
            <ColorSwatchPicker.Swatch />
          </ColorSwatchPicker.Item>
        ))}
      </ColorSwatchPicker>
    </ColorPicker>
  );
}
