export const mapCompany = (company) => {
  if (!company) {
    return null;
  }

  return {
    id: company.id,
    name: company.name,
    legalName: company.legalName,
    slug: company.slug,
    email: company.email,
    phone: company.phone,
    address: company.address,
    city: company.city,
    state: company.state,
    country: company.country,
    timezone: company.timezone,
    currency: company.currency,
    status: company.status,
    createdAt: company.createdAt,
    updatedAt: company.updatedAt,
  };
};
