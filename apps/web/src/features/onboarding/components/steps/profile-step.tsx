import { useFormContext } from "react-hook-form";
import { useI18n } from "@/lib/i18n-context";
import { getAllCountries, offeredLanguageIn } from "@/lib/locale";
import { useLocaleOptions } from "../../hooks/use-locale-options";
import type { SelectOption } from "../../lib/select-options";
import type { DetailsSchema } from "../../schemas/onboarding-schema";
import SearchableSelect from "../searchable-select";
import { FieldError } from "./field-parts";
import LevelFields from "./level-fields";

/** `suggestedCountry` leads the country list. */
export default function ProfileStep({
  suggestedCountry,
}: {
  suggestedCountry: string | undefined;
}) {
  const { t } = useI18n();
  const {
    watch,
    setValue,
    formState: { errors },
  } = useFormContext<DetailsSchema>();
  const allCountries = getAllCountries();
  const { countryOptions, languageOptions } = useLocaleOptions(
    allCountries,
    suggestedCountry,
    watch("country"),
    watch("language"),
  );

  const chooseCountry = (code: string) => {
    setValue("country", code, { shouldValidate: true });
    const chosen = allCountries.find((c) => c.code === code);
    if (chosen) {
      setValue("language", offeredLanguageIn(chosen.languages), {
        shouldValidate: true,
      });
    }
  };

  return (
    <div className="flex h-full flex-col gap-8">
      <div className="flex flex-col gap-6">
        <div>
          <SearchableSelect
            id="country"
            value={watch("country") || ""}
            onChange={chooseCountry}
            options={countryOptions}
            label={t("onboarding.profile.countryLabel")}
            placeholder={t("onboarding.profile.countryPlaceholder")}
          />
          <FieldError message={errors.country?.message} />
        </div>
        <LanguageField options={languageOptions} />
      </div>

      <LevelFields />
    </div>
  );
}

function LanguageField({ options }: { options: SelectOption[] }) {
  const { t } = useI18n();
  const {
    watch,
    setValue,
    formState: { errors },
  } = useFormContext<DetailsSchema>();
  const country = watch("country");
  return (
    <div>
      <SearchableSelect
        id="language"
        label={t("onboarding.profile.languageLabel")}
        value={watch("language") || ""}
        onChange={(code) =>
          setValue("language", code, { shouldValidate: true })
        }
        options={options}
        placeholder={t("onboarding.profile.languagePlaceholder")}
        disabled={!country}
      />
      <FieldError message={errors.language?.message} />
    </div>
  );
}
