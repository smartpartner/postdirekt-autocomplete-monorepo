/**
 * See LICENSE.txt for license details.
 */
import AddressAutocomplete from './model/autocomplete-handler';
import AddressInputType from './api/address-input-types';

const init = (
    form: HTMLFormElement,
    streetInput: HTMLInputElement,
    cityInput: HTMLInputElement,
    postalCodeInput: HTMLInputElement,
    houseNumberInput: HTMLInputElement,
    countryInput: HTMLInputElement,
    deCountryId: string,
    token: string,
): AddressAutocomplete => {
    const autocomplete = new AddressAutocomplete(
        form,
        new Map([
            [AddressInputType.Street, streetInput],
            [AddressInputType.PostalCode, postalCodeInput],
            [AddressInputType.City, cityInput],
            [AddressInputType.HouseNumber, houseNumberInput],
        ]),
        countryInput,
        deCountryId,
        token,
    );

    autocomplete.start();

    return autocomplete;
};

export default { init };
